import { existsSync, readFileSync } from "fs";
import path from "path";

import basicRedirect from "../../common/redirect.js";

import patch from "./patchModule.js";
import { getBranch } from "../../common/branchesLoader.js";
import { requestCounts } from "../../common/state.js";
import { log, withLogSection } from "../../common/logger.js";
import { config } from "../../common/config.js";

export const handleModuleDownload = withLogSection("v1 download module", async (c) => {
	const { branch, /*channel,*/ module, version } = c.req.param();

	if (!getBranch(branch)) {
		return c.notFound("Invalid sheltupdate branch");
	}

	if (config.stats) requestCounts.module_download++;

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	if (module === "discord_desktop_core") {
		const cacheName = `${module}-${branch}-${version}`;
		const cacheDir = path.resolve(`../cache/${cacheName}`);
		const cacheFinalFile = `${cacheDir}/module.zip`;

		if (existsSync(cacheFinalFile)) {
			log("Served cached discord_desktop_core");

			c.header("Content-Type", "application/zip");
			return c.body(readFileSync(cacheFinalFile));
		}

		return patch(c, cacheDir, cacheFinalFile);
	}

	return basicRedirect(c);
});
