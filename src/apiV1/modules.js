import basicProxy from "../common/proxy/index.js";
import { ensureBranchIsReady, getBranch } from "../common/branchesLoader.js";
import { reportEndpoint, reportUniqueUser } from "../dashboard/reporting.js";
import originatingIp from "../common/originatingIp.js";
import { log, withLogSection } from "../common/logger.js";

export const handleModules = withLogSection("v1 module update check", async (c) => {
	const { branch, channel } = c.req.param();
	const { platform, host_version } = c.req.query();

	await ensureBranchIsReady(branch);

	const branchObj = getBranch(branch);
	if (!branchObj) {
		return c.notFound("Invalid sheltupdate branch");
	}

	reportEndpoint("v1_modules");

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	if (platform === "linux" || platform === "win" || platform === "osx")
		reportUniqueUser(originatingIp(c), platform, `${platform} ${host_version}`, channel, branch, 1);

	let json = await basicProxy(c).then((r) => r.json());

	if (json.discord_desktop_core)
		json.discord_desktop_core = parseInt(`${branchObj.version}${json.discord_desktop_core.toString()}`);

	return c.json(json);
});
