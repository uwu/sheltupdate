import { getFinal } from "./patchModule.js";
import { reportEndpoint } from "../dashboard/reporting.js";
import { getBranch } from "../common/branchesLoader.js";
import { log, withLogSection } from "../common/logger.js";

export const handleModule = withLogSection("v2 download module", (c) => {
	if (!getBranch(c.req.param("branch"))) {
		return c.notFound("Invalid sheltupdate branch");
	}

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	reportEndpoint("v2_module");

	const buf = getFinal(c.req);

	c.header("Content-Type", "application/octet-stream");
	// hono annoyingly does not send content length by default, and dicor no likey that
	// https://github.com/honojs/hono/commit/501854f
	c.header("Content-Length", buf.byteLength);

	return c.body(buf);
});
