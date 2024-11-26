import { existsSync } from "fs";
import path from "path";

import basicRedirect from "../../../generic/redirect.js";

import patch from "./patchModule.js";

global.app.get("/:branch/modules/:channel/:module/:version", async (req, res) => {
	if (!branches[req.params.branch]) {
		res.status(404);

		res.send("Invalid GooseUpdate branch");
		return;
	}

	requestCounts.module_download++;

	console.log({
		type: "download_module",
		channel: req.params.channel,
		module: req.params.module,
		version: req.params.version,
		hostVersion: req.query.host_version,
		platform: req.query.platform,
	});

	if (req.params.module === "discord_desktop_core") {
		console.log(`[CustomModule] ${req.params.module} - version: ${req.params.version}`);

		console.log("[CustomModule] Checking cache");

		const cacheName = `${req.params.module}-${req.params.branch}-${req.params.version}`;
		const cacheDir = path.resolve(`../cache/${cacheName}`);
		const cacheFinalFile = `${cacheDir}/module.zip`;

		if (existsSync(cacheFinalFile)) {
			console.log("[CustomModule] Found cache dir, sending zip");

			res.sendFile(cacheFinalFile);
			return;
		}

		await patch(req, res, cacheDir, cacheFinalFile);

		return;
	}

	/*const prox = await basicProxy(req, res, {
    responseType: 'arraybuffer'
  });
  
  //console.log(prox);
  
  res.send(prox.data);*/

	basicRedirect(req, res);
});
