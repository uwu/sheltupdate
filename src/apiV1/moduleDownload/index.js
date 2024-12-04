import { existsSync, readFileSync } from "fs";
import path from "path";

import basicRedirect from "../../common/redirect.js";

import patch from "./patchModule.js";
import { branches } from "../../common/branchesLoader.js";
import { requestCounts } from "../../common/state.js";

export const handleModuleDownload = async (c) => {
	const { branch, channel, module, version } = c.req.param();

	if (!branches[branch]) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.module_download++;

	console.log({
		type: "download_module",
		channel,
		module,
		version,
		hostVersion: c.req.query("host_version"),
		platform: c.req.query("platform"),
	});

	if (module === "discord_desktop_core") {
		console.log(`[CustomModule] ${module} - version: ${version}`);

		console.log("[CustomModule] Checking cache");

		const cacheName = `${module}-${branch}-${version}`;
		const cacheDir = path.resolve(`../cache/${cacheName}`);
		const cacheFinalFile = `${cacheDir}/module.zip`;

		if (existsSync(cacheFinalFile)) {
			console.log("[CustomModule] Found cache dir, sending zip");

			c.header("Content-Type", "application/zip");
			return c.body(readFileSync(cacheFinalFile));
		}

		return patch(c, cacheDir, cacheFinalFile);
	}

	/*const prox = await basicProxy(req, res, {
    responseType: 'arraybuffer'
  });

  //console.log(prox);

  res.send(prox.data);*/

	return basicRedirect(c);
};
