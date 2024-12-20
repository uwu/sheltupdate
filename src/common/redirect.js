import { getProxyURL } from "./proxy/index.js";
import { reportRedirected } from "../dashboard/reporting.js";
import { config } from "./config.js";
import { log, withLogSection } from "./logger.js";

export default withLogSection("redirect", async (context, base = config.apiBases.v1) => {
	reportRedirected();

	const rUrl = context.req.url.replace(/.*:\/\/[^/]*/, "");
	const proxyUrl = `${base}${getProxyURL(rUrl)}`;

	log(proxyUrl);
	return context.redirect(proxyUrl);
});
