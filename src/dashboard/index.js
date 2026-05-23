import * as fs from "node:fs/promises";
import * as url from "node:url";
import * as path from "node:path";
import * as stream from "node:stream";
import * as esbuild from "esbuild";
import { Hono } from "hono";
import { getMimeType } from "hono/utils/mime";
import { getSingleBranchMetas } from "../common/branchesLoader.js";
import { config, srcDir, startTime, version } from "../common/config.js";
import { clusterStartTime, getAggregatedStatistics, getClusterHealth } from "../discovery.js";
import { cacheRoot } from "../common/cacheStores.js";

const workingDir = url.fileURLToPath(new URL("./", import.meta.url));
const distDir = path.join(cacheRoot, "dashboard/");
await fs.rm(distDir, { recursive: true, force: true });

try {
	var buildResults = await esbuild.build({
		absWorkingDir: workingDir,
		entryPoints: ["assets/dashboard.js"],
		entryNames: "[dir]/[name]-[hash]",
		outdir: distDir,

		absPaths: ["metafile"],
		metafile: true,

		bundle: true,
		minify: true,

		alias: {
			"country-flags": path.join(
				srcDir,
				"../node_modules/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2",
			),
		},
		loader: {
			".woff": "file",
			".woff2": "file",
		},
	});
	// Make sure the worker process exits
	await esbuild.stop();
} catch {
	// esbuild will have already reported the errors, this clause is just to make
	// sure they aren't duplicated in the terminal
	process.exit(1);
}

let entryJs, entryCss;
for (const [file, meta] of Object.entries(buildResults.metafile.outputs)) {
	const relative = path.relative(distDir, file);
	if (!meta.entryPoint) continue;
	entryJs = relative;
	entryCss = path.relative(distDir, meta.cssBundle);
	break;
}

const html = await fs.readFile(path.join(srcDir, "dashboard", "template.html"), "utf8");

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
		.replaceAll(
			"__SCRIPT_DATA__",
			JSON.stringify([
				startTime,
				clusterStartTime,
				Object.values(statsState.uniqueUsers),
				statsState.requestCounts,
				getSingleBranchMetas().map((b) => [b.name, b.displayName]),
			]),
		)
		.replaceAll("__ENTRY_JS__", entryJs)
		.replaceAll("__ENTRY_CSS__", entryCss)
		.replaceAll("__USER_COUNT__", Object.values(statsState.uniqueUsers).length)
		.replaceAll("__VERSION__", isRelease ? ` r${version}` : "")
		.replaceAll("__CACHE_PROX__", hitRatio(statsState.proxyCacheHitRatio))
		.replaceAll("__CACHE_V1__", hitRatio(statsState.v1ModuleCacheHitRatio))
		.replaceAll("__CACHE_V2__", hitRatio(statsState.v2ManifestCacheHitRatio))
		.replaceAll("__CLUSTER_STATUS__", () => (config.discovery.enabled ? clusterStatusTemplate() : ""))
		.replaceAll("__STAGING_MARQUEE__", isRelease ? "" : stagingMarquee);
}

export default new Hono()
	.get("/", (c) => {
		c.header("cache-control", "no-store, no-cache");
		return c.html(template(html));
	})
	.on(["GET", "HEAD"], "/_assets/:file{.+}", async (c) => {
		// Hono's file server is awful, let's not use it ^^

		const file = c.req.param("file");
		const distPath = path.join(distDir, file);
		if (!distPath.startsWith(distDir)) return c.notFound();

		try {
			var fd = await fs.open(distPath);
		} catch {
			return c.notFound();
		}

		const stat = await fd.stat();

		c.header("content-length", stat.size);
		c.header("content-type", getMimeType(file) || "application/octet-stream");
		c.header("cache-control", "max-age=31536000, immutable"); // hono makes it impossible to send a qpack compatible header :<

		if (c.req.method === "HEAD") {
			// The file isn't closed automatically in this case
			await fd.close();
			return c.body(null);
		} else {
			const webStream = stream.Readable.toWeb(fd.createReadStream());
			return c.body(webStream);
		}
	});
