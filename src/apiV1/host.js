import { branches } from "../common/branchesLoader.js";
import { requestCounts } from "../common/state.js";
import basicProxy from "../common/proxy/index.js";

export const handleNonSquirrel = async (c) => {
	// Non-Squirrel (Linux)
	if (!branches[c.req.param("branch")]) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.host_notsquirrel++;

	console.log({
		type: "host_nonsquirrel",
		channel: c.req.param("channel"),
		version: c.req.query("version"),
		platform: c.req.query("platform"),
	});

	// openasar does not handle redirects correctly, and will see non-204 and assume there's ALWAYS a host update
	// which leads to the event emitter hanging if there are no updates, so sadly we can't just redirect this.
	//basicRedirect(req, res);

	return basicProxy(c);
};

export const handleSquirrel = async (c) => {
	// Squirrel (non-Linux)
	if (!branches[c.req.param("branch")]) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.host_squirrel++;

	console.log({
		type: "host_squirrel",
		id: c.req.query("id"),
		localVersion: c.req.query("localVersion"),
		arch: c.req.query("arch"),
	});

	return basicProxy(c);
};
