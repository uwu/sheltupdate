import { existsSync, rmSync, mkdirSync } from "fs";

global.discordBase = global.config.apiBases?.v1 || "https://discord.com/api";

console.log(`Using proxy base: ${discordBase}`);

global.proxyCacheHitArr = [];
global.proxyVsRedirect = [];
global.uniqueUsers = {};
global.requestCounts = {
	host_squirrel: 0,
	host_notsquirrel: 0,
	modules: 0,
	module_download: 0,

	v2_manifest: 0,
	v2_module: 0,
};

const initCache = () => {
	if (existsSync(`../cache`)) {
		rmSync(`../cache`, { recursive: true });
		//return;
	}

	mkdirSync(`../cache`);
};

initCache();

import * as BranchesLoader from "./branchesLoader.js";
BranchesLoader.init();

import {} from "./requests/index.js";

import {} from "./dashboard/index.js";

// Temporary migration / fix for v1.x to v2.x users
if (global.config.deprecated?.guV2Migration) {
	import("./v2Migration.js");
}
