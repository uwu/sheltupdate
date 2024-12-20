import { getCustomFinal, getFinal } from "./patchModule.js";
import { reportEndpoint } from "../dashboard/reporting.js";
import { getBranch } from "../common/branchesLoader.js";
import { log, withLogSection } from "../common/logger.js";

export const handleModule = withLogSection("v2 download module", (c) => {
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	reportEndpoint("v2_module");

	return c.body(getFinal(c.req));
});

export const handleCustomModule = (c) => {
	reportEndpoint("v2_custom_module");

	return c.body(getCustomFinal(c.req));
};
