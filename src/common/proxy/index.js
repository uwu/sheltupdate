import * as Cache from "./cache.js";
import { config } from "../config.js";
import { reportProxyHit, reportProxyMiss } from "../../dashboard/reporting.js";
import ReusableResponse from "../reusableResponse.js";
import { withSection } from "../tracer.js";

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
	const cached = Cache.get(cacheUrl);

	const now = Date.now();

	if (cached && (now - cached.cachedOn) / 1000 / 60 < config.proxy.cache.maxMinutesToUseCached) {
		span.setAttribute("proxy.cache_hit", true);

		cached.lastUsed = now;

		reportProxyHit();

		return cached.resp.toRealRes();
	}

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
		Cache.set(cacheUrl, {
			resp: prox,
			cachedOn: now,
			lastUsed: now,
		});
	}

	// I do not know why hono/undici will not accept my ReusableResponse as is.
	return prox.toRealRes();
});
