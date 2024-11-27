import { getProxyURL } from "../lib.js";
import * as Cache from "./cache.js";
import {config} from "../../config.js";
import {proxyCacheHitArr, proxyVsRedirect} from "../../state.js";

export default async (context, options = {}, rpl = undefined, base = config.apiBases.v1) => {
	const req = context.req;
	const rUrl = req.url.replace(/.*:\/\/[^/]*/, "");
	proxyVsRedirect.push("proxy");

	console.log(options, rpl);

	let url = rpl !== undefined ? rUrl.replace(rpl[0], rpl[1]) : rUrl;
	url = getProxyURL(url);
	console.log(url);

	const cacheUrl = url.replace(/&_=[0-9]+$/, "");
	console.log(cacheUrl);
	const cached = Cache.get(cacheUrl);

	console.log(`${base}${url}`);

	const now = Date.now();

	if (cached && (now - cached.cachedOn) / 1000 / 60 < config.proxy.cache.maxMinutesToUseCached) {
		console.log("cached");

		cached.lastUsed = now;

		proxyCacheHitArr.push("cached");

		return cached.resp.clone();
	}

	proxyCacheHitArr.push("not cached");

	console.log("not cached");

	const proxRaw = await fetch(
		`${base}${url}`,
		{
			headers: { "User-Agent": config.proxy.useragent },
			...options,
		},
	);

	const prox = new Response(proxRaw.body,
		{
			...proxRaw,
			headers: {
				...Object.fromEntries(proxRaw.headers.entries()),
				"content-encoding": ""
			},
		})

	Cache.set(cacheUrl, {
		resp: prox.clone(),

		cachedOn: now,
		lastUsed: now,
	});

	return prox;
};
