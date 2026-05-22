import { config } from "../config.js";
import { proxyCache } from "../cacheStores.js";
import { reportProxyHit, reportProxyMiss } from "../../dashboard/reporting.js";
import ReusableResponse from "../reusableResponse.js";
import { withSection } from "../tracer.js";

const responseFromCacheEntry = (entry) => {
	const metadata = entry.metadata;

	return {
		cachedOn: metadata.cachedOn,
		resp: new ReusableResponse(
			{
				ok: metadata.ok,
				redirected: metadata.redirected,
				status: metadata.status,
				statusText: metadata.statusText,
				type: metadata.type,
				url: metadata.url,
				headers: new Headers(metadata.headers),
			},
			entry.body,
		),
	};
};

const getCachedProxyResponse = (key) => {
	const entry = proxyCache.get(key);
	if (!entry) return undefined;

	return responseFromCacheEntry(entry);
};

const setCachedProxyResponse = (key, resp, cachedOn) =>
	proxyCache.set(key, resp.toBuffer(), {
		cachedOn,
		ok: resp.ok,
		redirected: resp.redirected,
		status: resp.status,
		statusText: resp.statusText,
		type: resp.type,
		url: resp.url,
		headers: Array.from(resp.headers.entries()),
	});

export const getProxyURL = (url) => `/${url.split("/").slice(2).join("/")}`;

function performUrlReplacement(span, ctxturl, options, rpl, base) {
	const rUrl = ctxturl.replace(/.*:\/\/[^/]*/, "");

	let url = rpl !== undefined ? rUrl.replace(rpl[0], rpl[1]) : rUrl;
	url = base + getProxyURL(url);

	span.setAttributes({
		"proxy.options": JSON.stringify(options),
		"proxy.replacement": rpl,
		"proxy.target": url,
	});

	return url;
}

export const getEtag = withSection(
	"etag check",
	async (span, ctxtUrl, options = {}, rpl = undefined, base = config.apiBases.v1) => {
		const url = performUrlReplacement(span, ctxtUrl, options, rpl, base);

		const resp = await fetch(url, {
			method: "HEAD",
			...options,
		});

		return resp.headers.get("ETag");
	},
);

export default withSection("proxy", async (span, context, options = {}, rpl = undefined, base = config.apiBases.v1) => {
	const url = performUrlReplacement(span, context.req.url, options, rpl, base);

	const cacheUrl = url.replace(/&_=[0-9]+$/, "");
	const cached = getCachedProxyResponse(cacheUrl);

	const now = Date.now();

	if (cached && (now - cached.cachedOn) / 1000 / 60 < config.proxy.cache.maxMinutesToUseCached) {
		span.setAttribute("proxy.cache_hit", true);

		reportProxyHit();

		return cached.resp.toRealRes();
	}

	if (cached) proxyCache.delete(cacheUrl, "cached proxy response expired");

	reportProxyMiss();

	span.setAttribute("proxy.cache_hit", false);

	const proxRaw = await fetch(url, {
		headers: { "User-Agent": config.proxy.useragent },
		...options,
	});

	span.addEvent(`got response: ${proxRaw.status}`);

	const prox = await ReusableResponse.create(proxRaw);
	prox.headers.delete("Content-Encoding");

	if (proxRaw.ok) {
		setCachedProxyResponse(cacheUrl, prox, now);
	}

	// I do not know why hono/undici will not accept my ReusableResponse as is.
	return prox.toRealRes();
});
