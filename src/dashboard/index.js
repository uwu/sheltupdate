import { readFileSync } from "fs";
import { join } from "path";
import { statsState } from "./reporting.js";
import { srcDir, startTime, version } from "../common/config.js";
import { getSingleBranchMetas } from "../common/branchesLoader.js";
import { Hono } from "hono";

const html = readFileSync(join(srcDir, "dashboard", "template.html"), "utf8");
const css_ = readFileSync(join(srcDir, "dashboard", "dashboard.css"), "utf8");
const js__ = readFileSync(join(srcDir, "dashboard", "dashboard.js"), "utf8");

const hitRatio = ({ hit, miss }) => (hit || miss ? ((100 * hit) / (hit + miss)).toFixed(1) + "%" : "N/A");

const template = (temp) =>
	temp
		.replaceAll("__USER_COUNT__", Object.values(statsState.uniqueUsers).length)
		.replaceAll("__VERSION__", version)
		.replaceAll("__START_TIME__", startTime)
		.replaceAll("__STATE__", JSON.stringify(statsState))
		.replaceAll("__BRANCHES__", JSON.stringify(getSingleBranchMetas()))
		.replaceAll("__CACHE_PROX__", hitRatio(statsState.proxyCacheHitRatio))
		.replaceAll("__CACHE_V1__", hitRatio(statsState.v1ModuleCacheHitRatio))
		.replaceAll("__CACHE_V2__", hitRatio(statsState.v2ManifestCacheHitRatio));

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
