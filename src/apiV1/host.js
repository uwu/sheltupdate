import { getBranch } from "../common/branchesLoader.js";
import { reportEndpoint } from "../dashboard/reporting.js";
import basicProxy from "../common/proxy/index.js";
import { log, withLogSection } from "../common/logger.js";

export const handleNonSquirrel = withLogSection("v1 host linux", async (c) => {
	// Non-Squirrel (Linux)
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_host_notsquirrel");

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	return basicProxy(c);
});

export const handleSquirrel = withLogSection("v1 host squirrel", async (c) => {
	// Squirrel (non-Linux)
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_host_squirrel");

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	return basicProxy(c);
});
