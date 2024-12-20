import {readFileSync} from "fs";
import {join} from "path";
import {statsState} from "./reporting.js";
import {srcDir, startTime, version} from "../common/config.js";
import {getSingleBranchMetas} from "../common/branchesLoader.js";
import {Hono} from "hono";

const html = readFileSync(join(srcDir, "dashboard", "template.html"), "utf8");
const css_ = readFileSync(join(srcDir, "dashboard", "dashboard.css"), "utf8");
const js__ = readFileSync(join(srcDir, "dashboard", "dashboard.js"), "utf8");

const hitRatio = ({ hit, miss }) => hit || miss ? (100 * hit / (hit + miss)).toFixed(1) + "%" : "N/A";

const template = temp =>
	temp.replaceAll("{USER_COUNT}", Object.values(statsState.uniqueUsers).length)
		.replaceAll("{VERSION}", version)
		.replaceAll("{START_TIME}", startTime)
		.replaceAll("{STATE}", JSON.stringify(statsState))
		.replaceAll("{BRANCHES}", JSON.stringify(getSingleBranchMetas()))
		.replaceAll("{CACHE_PROX}", hitRatio(statsState.proxyCacheHitRatio))
		.replaceAll("{CACHE_V1}", hitRatio(statsState.v1ModuleCacheHitRatio))
		.replaceAll("{CACHE_V2}", hitRatio(statsState.v2ManifestCacheHitRatio));

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
