import { getCustomFinal, getFinal } from "./patchModule.js";
import { requestCounts } from "../common/state.js";
import { getBranch } from "../common/branchesLoader.js";
import { log, withLogSection } from "../common/logger.js";
import { config } from "../common/config.js";

export const handleModule = withLogSection("v2 download module", (c) => {
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	if (config.stats) requestCounts.v2_module++;

	return c.body(getFinal(c.req));
});

export const handleCustomModule = (c) => c.body(getCustomFinal(c.req));
