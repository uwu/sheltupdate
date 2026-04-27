import { readFileSync } from "fs";
import { join } from "path";
import { config, srcDir, startTime, version } from "../common/config.js";
import { getSingleBranchMetas } from "../common/branchesLoader.js";
import { Hono } from "hono";
import { clusterStartTime, getAggregatedStatistics, getClusterHealth } from "../discovery.js";

const html = readFileSync(join(srcDir, "dashboard", "template.html"), "utf8");
const css_ = readFileSync(join(srcDir, "dashboard", "dashboard.css"), "utf8");
const js__ = readFileSync(join(srcDir, "dashboard", "dashboard.js"), "utf8");

const hitRatio = ({ hit, miss }) => (hit || miss ? ((100 * hit) / (hit + miss)).toFixed(1) + "%" : "N/A");

const escape = (str) => str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const isRelease = ![undefined, "false", "0"].includes(process.env.SHELTUPDATE_RELEASE);
const stagingMarquee = `<div id="marquee-bar"><span id="marquee-text">${"STAGING  ".repeat(60)}</span></div>`;

function clusterStatusTemplate() {
	const nodes = getClusterHealth();
	return `
		<div id="cluster-status" class="stats-card">
			<h2 class="card-title">Cluster Status</h2>
			<div>
${nodes
	.map(
		([name, status]) => `				<div>
					<div class="cluster-node cluster-${status}"></div>
					<span>${escape(name)}: ${status[0].toUpperCase() + status.slice(1)}</span>
				</div>`,
	)
	.join("\n")}
			</div>
		</div>`;
}

function template(temp) {
	const statsState = getAggregatedStatistics();
	return temp
		.replaceAll("__USER_COUNT__", Object.values(statsState.uniqueUsers).length)
		.replaceAll("__VERSION__", version)
		.replaceAll("__NODE_START_TIME__", startTime)
		.replaceAll("__CLUSTER_START_TIME__", clusterStartTime)
		.replaceAll("__STATE__", JSON.stringify(statsState))
		.replaceAll("__BRANCHES__", JSON.stringify(getSingleBranchMetas()))
		.replaceAll("__CACHE_PROX__", hitRatio(statsState.proxyCacheHitRatio))
		.replaceAll("__CACHE_V1__", hitRatio(statsState.v1ModuleCacheHitRatio))
		.replaceAll("__CACHE_V2__", hitRatio(statsState.v2ManifestCacheHitRatio))
		.replaceAll("__CLUSTER_STATUS__", () => (config.discovery.enabled ? clusterStatusTemplate() : ""))
		.replaceAll("__STAGING_MARQUEE__", isRelease ? "" : stagingMarquee);
}

export default new Hono()
	.get("/", (c) => c.html(template(html)))
	.get("/dashboard.css", (c) => {
		c.header("Content-Type", "text/css");
		return c.body(template(css_));
	})
	.get("/dashboard.js", (c) => {
		c.header("Content-Type", "text/javascript");
		return c.body(template(js__));
	});
