import { createHash } from "crypto";
import { config } from "../common/config.js";

// state
export let statsState = {
	uniqueUsers: {},
	requestCounts: {
		v1_host_squirrel: 0,
		v1_host_notsquirrel: 0,
		v1_modules: 0,
		v1_module_download: 0,
		v2_manifest: 0,
		v2_module: 0,
	},
	proxyOrRedirect: {
		proxied: 0,
		redirected: 0,
	},
	proxyCacheHitRatio: {
		hit: 0,
		miss: 0,
	},
	v1ModuleCacheHitRatio: {
		hit: 0,
		miss: 0,
	},
	v2ManifestCacheHitRatio: {
		hit: 0,
		miss: 0,
	},
};

/// call on every endpoint hit
export function reportEndpoint(name) {
	if (!config.stats) return;
	statsState.requestCounts[name]++;
}

/// call on v1 handlemodules, v2 handlemanifest
export function reportUniqueUser(ip, platform, host_version, channel, branch, apiVer) {
	if (!config.stats) return;
	statsState.uniqueUsers[createHash("sha256").update(ip).digest("hex")] = {
		platform,
		host_version,
		channel,
		branch,
		apiVer,
		//time: Date.now(),
	};
}

/// call every time the proxy cache is used
export function reportProxyHit() {
	if (!config.stats) return;
	statsState.proxyOrRedirect.proxied++;
	statsState.proxyCacheHitRatio.hit++;
}

/// call every time a request is proxied
export function reportProxyMiss() {
	if (!config.stats) return;
	statsState.proxyOrRedirect.proxied++;
	statsState.proxyCacheHitRatio.miss++;
}

/// call every time a request is redirected
export function reportRedirected() {
	if (!config.stats) return;
	statsState.proxyOrRedirect.redirected++;
}

/// call every time v1 desktop_core is served from the cache
export function reportV1Cached() {
	if (!config.stats) return;
	statsState.v1ModuleCacheHitRatio.hit++;
}

/// call every time v21 desktop_core needs to be patched
export function reportV1Patched() {
	if (!config.stats) return;
	statsState.v1ModuleCacheHitRatio.miss++;
}

/// call every time v2 desktop_core is served from the cache
export function reportV2Cached() {
	if (!config.stats) return;
	statsState.v2ManifestCacheHitRatio.hit++;
}

/// call every time v2 desktop_core needs to be patched
export function reportV2Patched() {
	if (!config.stats) return;
	statsState.v2ManifestCacheHitRatio.miss++;
}
