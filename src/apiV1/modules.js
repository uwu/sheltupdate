import basicProxy from "../common/proxy/index.js";
import { ensureBranchIsReady, getBranch } from "../common/branchesLoader.js";
import { reportEndpoint, reportUniqueUser } from "../dashboard/reporting.js";
import originatingIp from "../common/originatingIp.js";
import { populateReqAttrs, withSection } from "../common/tracer.js";

export const handleModules = withSection("v1 module update check", async (span, c) => {
	const { branch, channel } = c.req.param();
	const { platform } = c.req.query();

	await ensureBranchIsReady(branch);

	const branchObj = getBranch(branch);
	if (!branchObj) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_modules");

	populateReqAttrs(span, c);

	reportUniqueUser({
		identitySource: "ip",
		identity: originatingIp(c),
		platform,
		channel,
		branch,
		apiVer: 1,
	});

	let json = await basicProxy(c).then((r) => r.json());

	if (json.discord_desktop_core)
		json.discord_desktop_core = parseInt(`${branchObj.version}${json.discord_desktop_core.toString()}`);

	return c.json(json);
});
