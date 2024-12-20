import { existsSync, readFileSync } from "fs";
import path from "path";

import basicRedirect from "../../common/redirect.js";

import patch from "./patchModule.js";
import { getBranch } from "../../common/branchesLoader.js";
import { reportEndpoint, reportV1Cached, reportV1Patched } from "../../dashboard/reporting.js";
import { log, withLogSection } from "../../common/logger.js";
import { cacheBase } from "../../common/fsCache.js";

export const handleModuleDownload = withLogSection("v1 download module", async (c) => {
	const { branch, /*channel,*/ module, version } = c.req.param();

	if (!getBranch(branch)) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_module_download");

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	if (module === "discord_desktop_core") {
		const cacheName = `${module}-${branch}-${version}`;
		const cacheDir = path.join(cacheBase, `v1-patch-scratch`, cacheName);
		const cacheFinalFile = path.join(cacheDir, "module.zip");

		if (existsSync(cacheFinalFile)) {
			log("Served cached discord_desktop_core");
			reportV1Cached();

			c.header("Content-Type", "application/zip");
			return c.body(readFileSync(cacheFinalFile));
		}

		reportV1Patched();
		return patch(c, cacheDir, cacheFinalFile);
	}

	return basicRedirect(c);
});
