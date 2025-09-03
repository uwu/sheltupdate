import { getBranch } from "../common/branchesLoader.js";
import { reportEndpoint } from "../dashboard/reporting.js";
import basicProxy from "../common/proxy/index.js";
import { populateReqAttrs, withSection } from "../common/tracer.js";

export const handleNonSquirrel = withSection("v1 host linux", async (span, c) => {
	// Non-Squirrel (Linux)
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_host_notsquirrel");

	populateReqAttrs(span, c);

	return basicProxy(c);
});

export const handleSquirrel = withSection("v1 host squirrel", async (span, c) => {
	// Squirrel (non-Linux)
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_host_squirrel");

	populateReqAttrs(span, c);

	return basicProxy(c);
});
