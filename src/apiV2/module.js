import { getFinal, getCustomFinal } from "./patchModule.js";

global.app.get(
	"/:branch/distro/app/:channel/:platform/:arch/:hostVersion/:moduleName/:moduleVersion/full.distro",
	(req, res) => {
		if (!branches[req.params.branch]) {
			res.status(404);

			res.send("Invalid GooseUpdate branch");
			return;
		}

		requestCounts.v2_module++;

		const toSend = getFinal(req);
		res.send(toSend);
	},
);

global.app.get("/custom_module/:moduleName/full.distro", (req, res) => {
	const toSend = getCustomFinal(req);
	res.send(toSend);
});
