import { getProxyURL } from "./proxy/index.js";
import { proxyVsRedirect } from "./state.js";
import { config } from "./config.js";

export default async (context, base = config.apiBases.v1) => {
	proxyVsRedirect.push("redirect");

	const rUrl = context.req.url.replace(/.*:\/\/[^/]*/, "");
	const proxyUrl = `${base}${getProxyURL(rUrl)}`;

	console.log(proxyUrl);
	return context.redirect(proxyUrl);
};
