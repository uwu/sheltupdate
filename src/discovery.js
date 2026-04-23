// @ts-check

import { Hono } from "hono";
import { config } from "./common/config.js";
import { statsState } from "./dashboard/reporting.js";
import { validator } from "hono/validator";

const pendingSeedEndpoints = new Set(config.discovery.nodes.map((n) => new URL(n).origin));
const nodeMap = new Map();

const validateDirectNode = (() => {
	const validateUniqueUser = (data) =>
		typeof data === "object" &&
		data !== null &&
		typeof data.platform === "string" &&
		typeof data.host_version === "string" &&
		typeof data.channel === "string" &&
		typeof data.branch === "string" &&
		typeof data.apiVer === "number";
	const validateUniqueUsers = (data) =>
		typeof data === "object" &&
		data !== null &&
		!Array.isArray(data) &&
		Object.values(data).every(validateUniqueUser);
	const validateRequestCounts = (data) =>
		typeof data === "object" &&
		data !== null &&
		typeof data.v1_host_squirrel === "number" &&
		typeof data.v1_host_notsquirrel === "number" &&
		typeof data.v1_modules === "number" &&
		typeof data.v1_module_download === "number" &&
		typeof data.v2_manifest === "number" &&
		typeof data.v2_module === "number";
	const validateProxyOrRedirect = (data) =>
		typeof data === "object" &&
		data !== null &&
		typeof data.proxied === "number" &&
		typeof data.redirected === "number";
	const validateRatio = (data) =>
		typeof data === "object" && data !== null && typeof data.hit === "number" && typeof data.miss === "number";
	const validateStatistics = (data) =>
		validateUniqueUsers(data.uniqueUsers) &&
		validateRequestCounts(data.requestCounts) &&
		validateProxyOrRedirect(data.proxyOrRedirect) &&
		validateRatio(data.proxyCacheHitRatio) &&
		validateRatio(data.v1ModuleCacheHitRatio) &&
		validateRatio(data.v2ManifestCacheHitRatio);
	const validateNodeCommon = (data) =>
		typeof data.name === "string" &&
		typeof data.id === "string" &&
		typeof data.ts === "number" &&
		validateStatistics(data.statistics);
	const validateIndirectNode = (data) =>
		validateNodeCommon(data) &&
		(typeof data.endpoint === "string" || data.endpoint == null) &&
		typeof data.online === "boolean";
	return (data) =>
		validateNodeCommon(data) &&
		typeof data.private === "boolean" &&
		Array.isArray(data.nodes) &&
		data.nodes.every(validateIndirectNode);
})();

const getDiscoveryData = () => ({
	name: config.discovery.name,
	id: config.discovery.id,
	private: config.discovery.private,
	ts: Date.now(),
	nodes: [...nodeMap.values()],
	statistics: statsState,
});

function fetchNodeData(endpoint) {
	const signal = AbortSignal.timeout(5000);
	const init = { signal };

	if (config.discovery.key) {
		init.method = "POST";
		init.body = JSON.stringify(getDiscoveryData());
		init.headers = {
			"x-shup-key": config.discovery.key,
			"content-type": "application/json",
		};
	}

	return fetch(new URL("/_discovery", endpoint), init).then(
		(r) =>
			r.ok
				? r.json().then(
						(data) => (validateDirectNode(data) ? { data } : { error: "Structure validation failed" }),
						(err) => ({ error: "Failed to parse JSON", cause: err.message }),
					)
				: { error: "Received non-ok status code", cause: r.status },
		(err) => ({ error: "Failed to fetch", cause: err.message }),
	);
}

function processNodeData(data, endpoint) {
	if (data.id === config.discovery.id) return false;

	let existingNode = nodeMap.get(data.id);
	if (existingNode && existingNode.ts > data.ts) return false;
	if (!existingNode) nodeMap.set(data.id, (existingNode = {}));

	Object.defineProperty(existingNode, "endpoint", {
		value: endpoint,
		enumerable: !data.private,
	});
	existingNode.name = data.name;
	existingNode.id = data.id;
	existingNode.online = true;
	existingNode.ts = data.ts;
	existingNode.statistics = data.statistics;

	for (const node of data.nodes) {
		if (node.id === config.discovery.id) continue;
		if (nodeMap.has(node.id)) {
			// If we don't have a direct path to a node, update if newer.
			const existing = nodeMap.get(node.id);
			if (existing.endpoint || node.ts < existing.ts) continue;
		}
		nodeMap.set(node.id, {
			endpoint: node.endpoint,
			name: node.name,
			id: node.id,
			online: node.online,
			ts: node.ts,
			statistics: node.statistics,
		});
		if (node.endpoint) pendingSeedEndpoints.delete(node.endpoint);
	}

	return true;
}

async function discoverNodes() {
	nodeMap.forEach(async (node) => {
		if (!node.endpoint) return;
		const result = await fetchNodeData(node.endpoint);
		if (!result.data) {
			node.online = false;
			return;
		}
		processNodeData(result.data, node.endpoint);
	});
}

async function seedNodes() {
	pendingSeedEndpoints.forEach(async (endpoint) => {
		const result = await fetchNodeData(endpoint);
		if (!result.data) return;
		if (processNodeData(result.data, endpoint)) pendingSeedEndpoints.delete(endpoint);
	});
	if (pendingSeedEndpoints.size === 0) clearInterval(seedInterval);
}

let seedInterval;
if (config.discovery.enabled) {
	seedInterval = setInterval(seedNodes, config.discovery.interval * 2);
	seedNodes();

	setInterval(discoverNodes, config.discovery.interval);
}

export default new Hono()
	.use(async (c, next) => {
		if (!config.discovery.enabled) return c.notFound();
		await next();
	})
	.get("/_discovery", (c) => {
		return c.json(getDiscoveryData());
	})
	.post(
		"/_discovery",
		async (c, next) => {
			if (!config.discovery.key || config.discovery.key !== c.req.header("x-shup-key")) {
				return c.text("Unauthorized", 403);
			}
			await next();
		},
		validator("json", (v, c) => {
			if (!validateDirectNode(v)) return c.text("Bad request", 400);
			return v;
		}),
		async (c) => {
			const data = await c.req.valid("json");

			processNodeData(data /* TODO: endpoint */);

			return c.json(getDiscoveryData());
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
export const getClusterHealth = () =>
	[{ name: config.discovery.name, online: true }, ...nodeMap.values()].map((n) => [n.name, n.online]);
