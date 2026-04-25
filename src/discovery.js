// @ts-check

import { Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { config, startTime } from "./common/config.js";
import { statsState } from "./dashboard/reporting.js";

/** @param  {...any} data */
const log = (...data) => console.log("[discovery]", ...data);

/** @type {Set<string>} */
const pendingSeeds = new Set(config.discovery.seeds.map((/** @type {string} */ n) => new URL(n).href));
// Marks whether or not statistics have been recovered from the mesh
let recoveredStatistics = false;

/** @type {Map<string, string>} */
const seedMap = new Map();
/** @type {Map<string, Node>} */
const nodeMap = new Map();

// Start time of the entire cluster, all nodes aim to get this value as low as
// possible by comparing their own start times.
export let clusterStartTime = startTime;

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
	startTime: "number.epoch",
	clusterStartTime: "number.epoch",
	statistics: Statistics,
});
const Nodes = Node.array().atLeastLength(1);

/**
 * @template S, T
 * @typedef {{ [K in keyof S]: S[K] extends T ? K : never; }[keyof S]} ExtractTypeKeys
 */

/**
 * @typedef {typeof Statistics.infer} Statistics
 * @typedef {typeof HitRatio.infer} HitRatio
 * @typedef {ExtractTypeKeys<Statistics, HitRatio>} HitRatioKeys
 * @typedef {typeof Node.infer} Node
 * @typedef {typeof Nodes.infer} Nodes
 */

/** @returns {Nodes} */
const getNodes = () => [
	{
		endpoint: config.discovery.endpoint,
		id: config.discovery.id,
		name: config.discovery.name,
		status: "online",
		ts: Date.now(),
		startTime,
		clusterStartTime,
		statistics: statsState,
	},
	...nodeMap.values(),
];

/**
 * @typedef {"fetch" | "parse" | "status" | "validation"} FetchError
 * @param {string} endpoint
 * @param {boolean=} preventPush
 * @returns {Promise<{ data: Nodes } | { error: FetchError, cause: any }>}
 */
async function fetchNodes(endpoint, preventPush = false) {
	const signal = AbortSignal.timeout(5000);
	/** @type {RequestInit} */
	const init = { signal };

	if (config.discovery.key && !preventPush) {
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

	let resp;
	try {
		resp = await fetch(new URL("/_discovery", endpoint), init);
	} catch (/** @type {any} */ err) {
		return { error: "fetch", cause: err?.cause?.code || String(err) };
	}

	let raw, extra;
	try {
		raw = await resp.json();
	} catch (err) {
		extra = { error: "parse", message: String(err) };
		return { error: "parse", cause: extra.message };
	} finally {
		if (!resp.ok) return { error: "status", cause: { status: resp.status, ...extra, ...raw } };
	}

	const data = Nodes(raw);
	if (data instanceof type.errors) {
		return { error: "validation", cause: data.summary };
	}

	return { data };
}

/**
 * @param {string} endpoint
 * @param {({ error: FetchError, cause: any })} data
 */
function reportFetchError(endpoint, data) {
	// This intentionally doesn't handle all cases, we don't care about some
	// failures outside of debugging.
	if (data.error === "status") {
		if (data.cause.status === 404) return;
		log("failed to fetch", endpoint, data.cause);
	} else if (data.error === "parse" || data.error === "validation") {
		log("failed to fetch", endpoint, data.cause);
	}
}

/**
 * @param {Node} data
 */
function processNode(data) {
	if (data.id === config.discovery.id) {
		if (!recoveredStatistics && data.ts < startTime) {
			mergeStatistics(statsState, data.statistics);
			recoveredStatistics = true;
		}
		return false;
	}

	let existing = nodeMap.get(data.id);
	if (existing && existing.ts >= data.ts) return;
	if (!existing) log("new node discovered:", data.id);
	nodeMap.set(data.id, data);

	if (data.clusterStartTime < clusterStartTime) clusterStartTime = data.clusterStartTime;
}

/**
 * @param {Nodes} nodes
 * @param {string=} seed
 */
function processNodes([primary, ...nodes], seed) {
	if (seed) {
		if (pendingSeeds.delete(seed)) {
			log("resolved seed node:", seed, "as", primary.id);
		}
		seedMap.set(primary.id, seed);
	}
	processNode(primary);
	for (const node of nodes) processNode(node);
}

function discoverNodes() {
	nodeMap.forEach(async (node) => {
		const endpoint = node.endpoint || seedMap.get(node.id);
		if (!endpoint) return;

		const result = await fetchNodes(endpoint);
		if (!("data" in result)) {
			// Mark node as offline and update timestamp so other nodes accept this update.
			node.status = "offline";
			node.ts = Date.now();
			return reportFetchError(endpoint, result);
		}

		processNodes(result.data);
	});
}

function seedNodes() {
	if (pendingSeeds.size === 0) return clearInterval(seedInterval);
	pendingSeeds.forEach(async (seed) => {
		// We may not push any data during the seed process, this would interfere
		// with our ability to recover statistics from the nodes.
		const result = await fetchNodes(seed, true);
		if (!("data" in result)) return reportFetchError(seed, result);
		processNodes(result.data, seed);
	});
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
	for (const node of nodeMap.values()) {
		const diff = Date.now() - node.ts;
		if (diff > DELETE_TIME) {
			nodeMap.delete(node.id);
			return;
		}

		if (!node.endpoint) {
			// Node is marked as unknown and then offline in stages, this is done
			// so that the node being updated does not cause it to be maintained
			// online indefinitely.
			if (node.status === "unknown" && diff > OFFLINE_TIME) {
				node.status = "offline";
				node.ts = Date.now();
				log("marked node as offline after inactivity:", node.id);
			} else if (node.status === "online" && diff > UNKNOWN_TIME) {
				node.status = "unknown";
				node.ts = Date.now();
				log("marked node as unknown after inactivity:", node.id);
			}
		}
	}
}

/** @type {NodeJS.Timeout} */
let seedInterval;
if (config.discovery.enabled) {
	log("discovery enabled; interval:", config.discovery.interval, "cluster:", !!config.discovery.key);

	seedInterval = setInterval(seedNodes, config.discovery.interval);
	seedNodes();

	setInterval(discoverNodes, config.discovery.interval);
	setInterval(maintainNodes, config.discovery.interval);
}

/** @type {import("@hono/arktype-validator").Hook<any, any, any>} */
function validationHook(result, c) {
	if (result.success) return;
	return c.json(
		{
			error: "validation",
			message: result.errors.summary,
		},
		400,
	);
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
			if (!config.discovery.key) {
				// Act as if a GET was issued if no key is configured.
				return c.json(getNodes());
			} else if (config.discovery.key !== c.req.header("x-shup-key")) {
				return c.json(
					{
						error: "unauthorized",
						message: "Mismatched cluster key",
					},
					403,
				);
			}
			await next();
		},
		arktypeValidator(
			"header",
			type({
				"x-shup-endpoint?": "string.url.parse",
			}),
			validationHook,
		),
		arktypeValidator("json", Nodes, validationHook),
		async (c) => {
			const nodes = await c.req.valid("json");
			const seed = await c.req.valid("header")["x-shup-endpoint"]?.href;

			processNodes(nodes, seed);
			return c.json(getNodes());
		},
	);

/**
 * @param {Statistics} onto
 * @param {Statistics} from
 */
function mergeStatistics(onto, from) {
	/**
	 * @param {Statistics} onto
	 * @param {Statistics} from
	 * @param {HitRatioKeys} key
	 */
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
	/** @type {Statistics} */
	const aggregate = JSON.parse(JSON.stringify(statsState));
	const statistics = [...nodeMap.values()].sort((a, b) => a.ts - b.ts).map((n) => n.statistics);
	for (const stats of statistics) mergeStatistics(aggregate, stats);
	return aggregate;
}
export const getClusterHealth = () =>
	[{ name: config.discovery.name, status: "live" }, ...nodeMap.values()].map((n) => [n.name, n.status]);
