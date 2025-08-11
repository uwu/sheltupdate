import { existsSync, readFileSync, rmSync } from "fs";
import path from "path";

import basicRedirect from "../../common/redirect.js";

import patch from "./patchModule.js";
import { getBranch } from "../../common/branchesLoader.js";
import { reportEndpoint, reportV1Cached, reportV1Patched } from "../../dashboard/reporting.js";
import { log, withLogSection, logSection } from "../../common/logger.js";
import { cacheBase } from "../../common/fsCache.js";
import { getEtag } from "../../common/proxy/index.js";

const cacheEtags = new Map();

export const handleModuleDownload = withLogSection("v1 download module", async (c) => {
	const { branch, /*channel,*/ module, version } = c.req.param();

	const branchFull = getBranch(branch);
	if (!branchFull) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_module_download");

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	if (module === "discord_desktop_core") {
		const cacheName = `${module}-${branch}-${version}`;
		const cacheDir = path.join(cacheBase, `v1-desktop-core`, cacheName);
		const cacheFinalFile = path.join(cacheDir, "module.zip");

		const etag = await getEtag(c.req.url, {}, [version, version.substring(branchFull.version.toString().length)]);

		if (existsSync(cacheFinalFile)) {
			// if cache is valid
			if (etag && etag == cacheEtags.get(cacheFinalFile)) {
				log("Served cached discord_desktop_core");
				reportV1Cached();

				c.header("Content-Type", "application/zip");
				return c.body(readFileSync(cacheFinalFile));
			} else {
				logSection("etag check", () =>
					log("etag mismatch, expecting", cacheEtags.get(cacheFinalFile, "but got", etag)),
				);

				cacheEtags.delete(cacheFinalFile);
				// delete cache and fall through to patch
				rmSync(cacheDir, { recursive: true, force: true });
			}
		}

		// set expected etag
		cacheEtags.set(cacheFinalFile, etag);

		reportV1Patched();
		return patch(c, cacheDir, cacheFinalFile);
	}

	return basicRedirect(c);
});
