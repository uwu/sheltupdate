import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

export const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const startTime = Date.now();

export const changelog = readFileSync(resolve(srcDir, "../CHANGELOG.md"), "utf8");

export const version = changelog.match(/(?<=^## r)\d+/m)[0];

if (!version) throw new Error("Version number not found, changelog is missing or has invalid format.");

let rawCfg;
try {
	rawCfg = JSON.parse(readFileSync(process.env.SHELTUPDATE_CONFIG || resolve(srcDir, "../config.json"), "utf8"));
} catch (e) {
	console.error("Failed to load config, using defaults");
}

const DEFAULT_PORT = 8080;

export const config = Object.freeze({
	port: rawCfg?.port || DEFAULT_PORT,
	host: rawCfg?.host || `http://localhost:${rawCfg?.port || DEFAULT_PORT}`,
	setupIntervalHours: rawCfg?.setupIntervalHours ?? 3,
	cloudflared: {
		enabled: !!rawCfg?.cloudflared?.enabled,
		binary: rawCfg?.cloudflared?.binary || "cloudflared",
	},
	stats: rawCfg?.stats ?? true,
	discovery: {
		enabled: !!rawCfg?.discovery?.enabled,
		name: rawCfg?.discovery?.name || "Unknown",
		id: rawCfg?.discovery?.id,
		key: rawCfg?.discovery?.key,
		endpoint: rawCfg?.discovery?.endpoint,
		private: !!rawCfg?.discovery?.private, // Has no effect if `endpoint` and `key` are not specified
		interval: rawCfg?.discovery?.interval * 1000 || 15000,
		seeds: rawCfg?.discovery?.seeds ?? [],
	},
	tracing: {
		service: rawCfg?.tracing?.service ?? "sheltupdate",
		log: rawCfg?.tracing?.log ?? true,
		otlpEndpoint: rawCfg?.tracing?.otlpEndpoint,
		otlpType: rawCfg?.tracing?.otlpType ?? "protobuf", // "protobuf" | "json" | "grpc"
	},
	proxy: {
		cache: {
			lastUsedRemoveHours: rawCfg?.proxy?.cache?.lastUsedRemoveHours ?? 1,
			maxMinutesToUseCached: rawCfg?.proxy?.cache?.maxMinutesToUseCached ?? 30,
		},
		useragent:
			rawCfg?.proxy?.useragent ||
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) discord/0.0.76 Chrome/128.0.6613.186 Electron/32.2.2 Safari/537.36",
	},
	apiBases: {
		v1: rawCfg?.apiBases?.v1 || "https://discord.com/api",
		v2: rawCfg?.apiBases?.v2 || "https://discord.com/api/updates",
	},
	webhook: {
		enable: rawCfg?.webhook?.enable ?? false,
		url: rawCfg?.webhook?.url || "https://discord.com/api/webhooks/X",
		username: rawCfg?.webhook?.username || "GooseUpdate",
		avatarUrl:
			rawCfg?.webhook?.avatarUrl ||
			"https://cdn.discordapp.com/avatars/760559484342501406/5125aff2f446ad7c45cf2dfd6abf92ed.png",
	},
});

console.log(config);
