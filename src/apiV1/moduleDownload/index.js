import basicRedirect from "../../common/redirect.js";

import patch from "./patchModule.js";
import { getBranch } from "../../common/branchesLoader.js";
import { reportEndpoint, reportV1Cached, reportV1Patched } from "../../dashboard/reporting.js";
import { populateReqAttrs, withSection } from "../../common/tracer.js";
import { v1ModuleCache } from "../../common/cacheStores.js";
import { getEtag } from "../../common/proxy/index.js";

const getCacheKey = (module, branch, version) => `${branch}:${module}:${version}`;

export const handleModuleDownload = withSection("v1 download module", async (span, c) => {
	const { branch, /*channel,*/ module, version } = c.req.param();

	const branchFull = getBranch(branch);
	if (!branchFull) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_module_download");

	populateReqAttrs(span, c);

	if (module === "discord_desktop_core") {
		const cacheKey = getCacheKey(module, branch, version);
		const etag = await getEtag(c.req.url, {}, [version, version.substring(branchFull.version.toString().length)]);
		const cached = v1ModuleCache.get(cacheKey);

		if (cached) {
			// if cache is valid
			if (etag && etag === cached.metadata.etag) {
				span.addEvent("Served cached discord_desktop_core");
				reportV1Cached();

				c.header("Content-Type", "application/zip");
				return c.body(cached.body);
			} else {
				span.addEvent(`etag mismatch, expecting ${cached.metadata.etag} but got ${etag}`);
				// delete cache and fall through to patch
				v1ModuleCache.delete(cacheKey, `etag mismatch: expected ${cached.metadata.etag}, got ${etag}`);
			}
		}

		// wait for patch to complete
		reportV1Patched();
		const body = await patch(c);

		// set expected etag in cache after
		if (etag) v1ModuleCache.set(cacheKey, body, { etag });

		c.header("Content-Type", "application/zip");
		return c.body(body);
	}

	return basicRedirect(c);
});
