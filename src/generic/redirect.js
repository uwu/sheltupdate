import { getProxyURL } from "./lib.js";

export default async (req, res, base = global.discordBase) => {
	proxyVsRedirect.push("redirect");

	const proxyUrl = `${base}${getProxyURL(req.url)}`;

	console.log(proxyUrl);
	res.redirect(proxyUrl);
};
