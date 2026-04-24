import { Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { config, startTime } from "./common/config.js";
import { statsState } from "./dashboard/reporting.js";

const pendingSeeds = new Set(config.discovery.seeds.map((n) => new URL(n).origin));

const seedMap = new Map();
const nodeMap = new Map();

const UniqueUser = type({
	platform: "string",
	host_version: "string",
	channel: "string",
	branch: "string",
	apiVer: "number",
});
const HitRatio = type({
	hit: "number >= 0",
	miss: "number >= 0",
});
const Statistics = type({
	uniqueUsers: type.Record("string", UniqueUser),
	requestCounts: {
		v1_host_squirrel: "number >= 0",
		v1_host_notsquirrel: "number >= 0",
		v1_modules: "number >= 0",
		v1_module_download: "number >= 0",
		v2_manifest: "number >= 0",
		v2_module: "number >= 0",
	},
	proxyOrRedirect: {
		proxied: "number >= 0",
		redirected: "number >= 0",
	},
	proxyCacheHitRatio: HitRatio,
	v1ModuleCacheHitRatio: HitRatio,
	v2ManifestCacheHitRatio: HitRatio,
});
const Node = type({
	"endpoint?": "string.url",
	name: "string",
	id: "string",
	status: '"online" | "offline" | "unknown"',
	ts: "number.epoch",
	"startTime?": "number.epoch",
	statistics: Statistics,
});
const Nodes = Node.array();

const getNodes = () => [
	{
		endpoint: config.discovery.endpoint,
		id: config.discovery.id,
		name: config.discovery.name,
		status: "online",
		ts: Date.now(),
		startTime,
		statistics: statsState,
	},
	...nodeMap.values(),
];

function fetchNodes(endpoint) {
	const signal = AbortSignal.timeout(5000);
	const init = { signal };

	if (config.discovery.key) {
		init.method = "POST";
		init.body = JSON.stringify(getNodes());
		init.headers = new Headers({
			"content-type": "application/json",
			"x-shup-key": config.discovery.key,
		});
		if (config.discovery.endpoint) {
			init.headers.set("x-shup-endpoint", config.discovery.endpoint);
		}
	}

	return fetch(new URL("/_discovery", endpoint), init).then(
		(r) =>
			r.ok
				? r.json().then(
						(raw) => {
							const data = Nodes(raw);
							return data instanceof type.errors
								? { error: "Structure validation failed", cause: data.summary }
								: { data: data };
						},
						(err) => ({ error: "Failed to parse JSON", cause: err.message }),
					)
				: { error: "Received non-ok status code", cause: r.status },
		(err) => ({ error: "Failed to fetch", cause: err.message }),
	);
}

function processNode(data) {
	if (data.id === config.discovery.id) return false;

	let node = nodeMap.get(data.id);
	if (node && node.ts > data.ts) return false;
	if (!node) nodeMap.set(data.id, (node = {}));

	node.endpoint = data.endpoint;
	node.name = data.name;
	node.id = data.id;
	node.status = data.status;
	node.ts = data.ts;
	node.startTime = data.startTime;
	node.statistics = data.statistics;

	pendingSeeds.delete(node.endpoint);
	return true;
}

function processNodes([primary, ...nodes], seed) {
	if (seed) seedMap.set(primary.id, seed);
	processNode(primary);
	for (const node of nodes) processNode(node);
}

async function discoverNodes() {
	nodeMap.forEach(async (node) => {
		const endpoint = node.endpoint || seedMap.get(node.id);
		if (!endpoint) return;

		const result = await fetchNodes(endpoint);
		if (!result.data) {
			node.status = "offline";
			node.ts = Date.now();
			return;
		}

		processNodes(result.data);
	});
}

async function seedNodes() {
	pendingSeeds.forEach(async (seed) => {
		const result = await fetchNodes(seed);
		if (!result.data) return;
		processNodes(result.data, seed);
	});
	if (pendingSeeds.size === 0) clearInterval(seedInterval);
}

// This is only for nodes that are private and have been introduced indirectly.
// Example:
// Node A <-/-> Node B <---> Node C
//   ^-________________________/
// B is the only node capable of directly contacting C, if B is offline we
// cannot know if C is still online, C might still be pushing data to us.
const UNKNOWN_TIME = config.discovery.interval * 2; // default 30 seconds
const OFFLINE_TIME = UNKNOWN_TIME * 2; // default 1 minute

// Offline nodes may be held forever if enough nodes are online at all times,
// delete them if it gets out of hand.
const DELETE_TIME = 7 * 24 * 60 * 60 * 1000; // 1 week

function maintainNodes() {
	nodeMap.forEach((node) => {
		const diff = Date.now() - node.ts;
		if (diff > DELETE_TIME) {
			nodeMap.delete(node.id);
			return;
		}

		if (!node.endpoint) {
			if (node.status === "unknown" && diff > OFFLINE_TIME) {
				node.status = "offline";
				node.ts = Date.now();
			} else if (node.status === "online" && diff > UNKNOWN_TIME) {
				node.status = "unknown";
				node.ts = Date.now();
			}
		}
	});
}

let seedInterval;
if (config.discovery.enabled) {
	seedInterval = setInterval(seedNodes, config.discovery.interval);
	seedNodes();

	setInterval(discoverNodes, config.discovery.interval);
	setInterval(maintainNodes, config.discovery.interval);
}

export default new Hono()
	.use(async (c, next) => {
		if (!config.discovery.enabled) return c.notFound();
		await next();
	})
	.get("/_discovery", (c) => {
		return c.json(getNodes());
	})
	.post(
		"/_discovery",
		async (c, next) => {
			if (!config.discovery.key || config.discovery.key !== c.req.header("x-shup-key")) {
				return c.text("Unauthorized", 403);
			}
			await next();
		},
		arktypeValidator("json", Nodes),
		async (c) => {
			const nodes = await c.req.valid("json");
			const seed = await c.req.header("x-shup-endpoint");
			processNodes(nodes, seed);
			return c.json(getNodes());
		},
	);

function mergeStatistics(onto, from) {
	function mergeHitRatio(onto, from, key) {
		const ontoRatio = onto[key],
			fromRatio = from[key];
		ontoRatio.hit += fromRatio.hit;
		ontoRatio.miss += fromRatio.miss;
	}

	Object.assign(onto.uniqueUsers, from.uniqueUsers);

	const ontoRequestCounts = onto.requestCounts,
		fromRequestCounts = from.requestCounts;
	ontoRequestCounts.v1_host_squirrel += fromRequestCounts.v1_host_squirrel;
	ontoRequestCounts.v1_host_notsquirrel += fromRequestCounts.v1_host_notsquirrel;
	ontoRequestCounts.v1_modules += fromRequestCounts.v1_modules;
	ontoRequestCounts.v1_module_download += fromRequestCounts.v1_module_download;
	ontoRequestCounts.v2_manifest += fromRequestCounts.v2_manifest;
	ontoRequestCounts.v2_module += fromRequestCounts.v2_module;

	const ontoPOR = onto.proxyOrRedirect,
		fromPOR = from.proxyOrRedirect;
	ontoPOR.proxied += fromPOR.proxied;
	ontoPOR.redirected += fromPOR.redirected;

	mergeHitRatio(onto, from, "proxyCacheHitRatio");
	mergeHitRatio(onto, from, "v1ModuleCacheHitRatio");
	mergeHitRatio(onto, from, "v2ManifestCacheHitRatio");
}
export function getAggregatedStatistics() {
	const aggregate = JSON.parse(JSON.stringify(statsState));
	const statistics = [...nodeMap.values()].sort((a, b) => a.ts - b.ts).map((n) => n.statistics);
	for (const stats of statistics) mergeStatistics(aggregate, stats);
	return aggregate;
}
export function getClusterStartTime() {
	let earliest = startTime;
	for (const node of nodeMap.values()) {
		if (node.startTime && node.startTime < earliest) earliest = node.startTime;
	}
	return earliest;
}
export const getClusterHealth = () =>
	[{ name: config.discovery.name, status: "live" }, ...nodeMap.values()].map((n) => [n.name, n.status]);
