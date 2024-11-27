import {existsSync, mkdirSync, rmSync} from "fs";

export let proxyCacheHitArr = [];
export let proxyVsRedirect = [];
export let uniqueUsers = {};
export let requestCounts = {
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