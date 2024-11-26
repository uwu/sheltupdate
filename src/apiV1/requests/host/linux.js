import basicRedirect from "../../../generic/redirect.js";
import basicProxy from "../../../generic/proxy/index.js";

global.app.get("/:branch/updates/:channel", async (req, res) => {
	// Non-Squirrel (Linux)
	if (!branches[req.params.branch]) {
		res.status(404);

		res.send("Invalid GooseUpdate branch");
		return;
	}

	requestCounts.host_notsquirrel++;

	console.log({
		type: "host_nonsquirrel",
		channel: req.params.channel,
		version: req.query.version,
		platform: req.query.platform,
	});
	// console.log(`${discordBase}${req.url}`);

	// openasar does not handle redirects correctly, and will see non-204 and assume there's ALWAYS a host update
	// which leads to the event emitter hanging if there are no updates, so sadly we can't just redirect this.
	//basicRedirect(req, res);

	const proxied = await basicProxy(req, res);
	res.code(proxied.status);
	return proxied.data;
});
