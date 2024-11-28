import {getCustomFinal, getFinal} from "./patchModule.js";
import {requestCounts} from "../common/state.js";
import {branches} from "../common/branchesLoader.js";

export const handleModule =
	(c) => {
		if (!branches[c.req.param("branch")]) {
			return c.notFound("Invalid sheltupdate branch");
		}

		requestCounts.v2_module++;

		return c.body(getFinal(c.req));
	};

export const handleCustomModule = (c) => c.body(getCustomFinal(c.req))
