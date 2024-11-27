import basicProxy from "../generic/proxy/index.js";
import {branches} from "../branchesLoader.js";
import {requestCounts, uniqueUsers} from "../state.js";

export const handleModules = async (c) => {
	const {branch, channel} = c.req.param();
	const {platform, host_version} = c.req.query();

	if (!branches[branch]) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.modules++;

	console.log({ type: "check_for_module_updates", channel });

	if (platform === "linux" || platform === "win" || platform === "osx") {
		const ip = c.req.header("cf-connecting-ip") ?? c.env.incoming.socket.remoteAddress;

		uniqueUsers[ip] = {
			platform,
			host_version,
			channel,
			branch,
			apiVersion: "v1",
			time: Date.now(),
		};
	}

	let json = await basicProxy(c).then(r => r.json());

	console.log(json);

	if (json.discord_desktop_core)
		json.discord_desktop_core = parseInt(
			`${branches[branch].version}${json.discord_desktop_core.toString()}`,
		);

	return c.json(json);
};
