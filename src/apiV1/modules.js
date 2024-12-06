import basicProxy from "../common/proxy/index.js";
import { getBranch } from "../common/branchesLoader.js";
import { requestCounts, uniqueUsers } from "../common/state.js";
import originatingIp from "../common/originatingIp.js";

export const handleModules = async (c) => {
	const { branch, channel } = c.req.param();
	const { platform, host_version } = c.req.query();

	const branchObj = getBranch(branch);
	if (!branchObj) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.modules++;

	console.log({ type: "check_for_module_updates", channel });

	if (platform === "linux" || platform === "win" || platform === "osx") {
		const ip = originatingIp(c);

		uniqueUsers[ip] = {
			platform,
			host_version,
			channel,
			branch,
			apiVersion: "v1",
			time: Date.now(),
		};
	}

	let json = await basicProxy(c).then((r) => r.json());

	console.log(json);

	if (json.discord_desktop_core)
		json.discord_desktop_core = parseInt(`${branchObj.version}${json.discord_desktop_core.toString()}`);

	return c.json(json);
};
