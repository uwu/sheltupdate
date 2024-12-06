import * as Cache from "./cache.js";
import { config } from "../config.js";
import { proxyCacheHitArr, proxyVsRedirect } from "../state.js";
import ReusableResponse from "../reusableResponse.js";
import { log, withLogSection } from "../logger.js";

export const getProxyURL = (url) => `/${url.split("/").slice(2).join("/")}`;

export default withLogSection("proxy", async (context, options = {}, rpl = undefined, base = config.apiBases.v1) => {
	const req = context.req;
	const rUrl = req.url.replace(/.*:\/\/[^/]*/, "");
	if (config.stats) proxyVsRedirect.push("proxy");

	let url = rpl !== undefined ? rUrl.replace(rpl[0], rpl[1]) : rUrl;
	url = getProxyURL(url);

	const cacheUrl = url.replace(/&_=[0-9]+$/, "");
	const cached = Cache.get(cacheUrl);

	log("options:", options, "replacement:", rpl, `target: ${base}${url}`);

	const now = Date.now();

	if (cached && (now - cached.cachedOn) / 1000 / 60 < config.proxy.cache.maxMinutesToUseCached) {
		log("cached");

		cached.lastUsed = now;

		if (config.stats) proxyCacheHitArr.push("cached");

		return cached.resp.toRealRes();
	}

	if (config.stats) proxyCacheHitArr.push("not cached");

	log("not cached");

	const proxRaw = await fetch(`${base}${url}`, {
		headers: { "User-Agent": config.proxy.useragent },
		...options,
	});

	log("waiting on network...");

	const prox = await ReusableResponse.create(proxRaw);
	prox.headers.delete("Content-Encoding");

	Cache.set(cacheUrl, {
		resp: prox,

		cachedOn: now,
		lastUsed: now,
	});

	log("proxy finished");

	// I do not know why hono/undici will not accept my ReusableResponse as is.
	return prox.toRealRes();
});
