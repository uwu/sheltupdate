import basicRedirect from "../../../generic/redirect.js";

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

	basicRedirect(req, res);
});
