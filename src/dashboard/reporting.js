import { createHmac, randomUUID } from "crypto";
import { config } from "../common/config.js";

// state
/** @type {import("../discovery.js").Statistics} */
export const statsState = {
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

const hmacKey = config.discovery.key ?? randomUUID();
/// call on v1 handlemodules, v2 handlemanifest
export function reportUniqueUser({ identity, identitySource, platform, arch, channel, branch, apiVer }) {
	if (!config.stats) return;

	// Reject invalid reports, upstream will return 400 for these.
	// Maybe validate everything using arktype in the future?
	if (identitySource !== "install_id" && identitySource !== "ip") return;
	if (!identity) return;
	if (platform !== "linux" && platform !== "win" && platform !== "osx") return;
	if (channel !== "stable" && channel !== "ptb" && channel !== "canary" && channel !== "development") return;

	const id = createHmac("sha256", hmacKey).update(`${identitySource}:${identity}`).digest("hex");
	statsState.uniqueUsers[id] = {
		platform,
		arch,
		channel,
		branch,
		apiVer,
		ts: getUnixDay(),
	};
}

// (Don't Fear) The Reaper
const uniqueUserDecay = 4; // 4 days, this isn't configurable to make it consistent across the cluster.
const getUnixDay = () => ~~(Date.now() / 1000 / 60 / 60 / 24);

// Is this the most efficient way to do this? Probably not. Does that matter? No.
function cleanUniqueUsers() {
	const expire = getUnixDay() - uniqueUserDecay;
	for (const id in statsState.uniqueUsers) {
		if (statsState.uniqueUsers[id].ts < expire) {
			delete statsState.uniqueUsers[id];
		}
	}
}
if (config.stats) {
	cleanUniqueUsers();
	setInterval(cleanUniqueUsers, 24 * 60 * 60 * 1000);
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
