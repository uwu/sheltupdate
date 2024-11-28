import {readFileSync} from "fs";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";

export const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const startTime = Date.now();

export const version = "1";

let rawCfg;
try {
	rawCfg = JSON.parse(readFileSync(resolve(srcDir, "../config.json"), "utf8"));
} catch (e) {
	console.error("Failed to load config, using defaults");
}

export const config = Object.freeze({
	port: rawCfg?.port || 8080,
	host: rawCfg?.host || (`http://localhost:${rawCfg?.port || 8080}`),
	proxy: {
		cache: {
			lastUsedRemoveHours: rawCfg?.proxy?.cache?.lastUsedRemoveHours ?? 1,
			maxMinutesToUseCached: rawCfg?.proxy?.cache?.maxMinutesToUseCached ?? 30
		},
		useragent: rawCfg?.proxy?.useragent || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.76 Chrome/128.0.6613.186 Electron/32.2.2 Safari/537.36"
	},
	apiBases: {
		v1: rawCfg?.apiBases?.v1 || "https://discord.com/api",
		v2: rawCfg?.apiBases?.v2 || "https://discord.com/api/updates",
	},
	webhook: {
		enable: rawCfg?.webhook?.enable ?? false,
		url: rawCfg?.webhook?.url || "https://discord.com/api/webhooks/X",
		username: rawCfg?.webhook?.username || "GooseUpdate",
		avatarUrl: rawCfg?.webhook?.avatarUrl || "https://cdn.discordapp.com/avatars/760559484342501406/5125aff2f446ad7c45cf2dfd6abf92ed.png"
	}
});

console.log(config);