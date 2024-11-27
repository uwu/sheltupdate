import { getProxyURL } from "../lib.js";
import * as Cache from "./cache.js";

export default async (req, res, options = {}, rpl = undefined, base = global.discordBase) => {
	proxyVsRedirect.push("proxy");

	console.log(`${base}${req.url}`);

	console.log(options, rpl);

	let url = rpl !== undefined ? req.url.replace(rpl[0], rpl[1]) : req.url;
	url = getProxyURL(url);
	console.log(url);

	const cacheUrl = url.replace(/&_=[0-9]+$/, "");
	console.log(cacheUrl);
	const cached = Cache.get(cacheUrl);

	const now = Date.now();

	if (cached && (now - cached.cachedOn) / 1000 / 60 < (global.config.proxy?.cache?.maxMinutesToUseCached || 30)) {
		console.log("cached");

		cached.lastUsed = now;

		proxyCacheHitArr.push("cached");

		return cached.resp;
	}

	proxyCacheHitArr.push("not cached");

	console.log("not cached");

	let prox = await fetch(
		`${base}${url}`,
		{
			headers: {
				"User-Agent":
					global.config.proxy?.useragent ||
					"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.116 Chrome/83.0.4103.122 Electron/9.3.5 Safari/537.36",
			},
			...options,
		},
	);

	res.status(prox.status);

	Cache.set(cacheUrl, {
		resp: prox,

		cachedOn: now,
		lastUsed: now,
	});

	return prox;
};
