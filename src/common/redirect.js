import { getProxyURL } from "./proxy/index.js";
import { proxyVsRedirect } from "./state.js";
import { config } from "./config.js";
import { log, withLogSection } from "./logger.js";

export default withLogSection("redirect", async (context, base = config.apiBases.v1) => {
	proxyVsRedirect.push("redirect");

	const rUrl = context.req.url.replace(/.*:\/\/[^/]*/, "");
	const proxyUrl = `${base}${getProxyURL(rUrl)}`;

	log(proxyUrl);
	return context.redirect(proxyUrl);
});
