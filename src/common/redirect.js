import { getProxyURL } from "./proxy/index.js";
import { reportRedirected } from "../dashboard/reporting.js";
import { config } from "./config.js";
import { withSection } from "./tracer.js";

export default withSection("redirect", async (span, context, base = config.apiBases.v1) => {
	reportRedirected();

	const rUrl = context.req.url.replace(/.*:\/\/[^/]*/, "");
	const proxyUrl = `${base}${getProxyURL(rUrl)}`;

	span.setAttribute("redirect.proxy_url", proxyUrl);

	return context.redirect(proxyUrl);
});
