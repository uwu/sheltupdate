import { Readable } from "stream";
import { createHash } from "crypto";

import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "fs";
import { join, relative, win32, posix } from "path";

import tar from "tar";
import glob from "glob";

import { brotliDecompressSync, brotliCompressSync, constants } from "zlib";
import { ensureBranchIsReady, getBranch, getSingleBranchMetas } from "../common/branchesLoader.js";
import { section, withSection } from "../common/tracer.js";
import { SpanStatusCode } from "@opentelemetry/api";
import { createCacheTempDir, v2ModuleCache } from "../common/cacheStores.js";
import { reportV2Cached, reportV2Patched } from "../dashboard/reporting.js";
import { dcMain, dcPreload } from "../desktopCore/index.js";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const getCacheName = (moduleName, moduleVersion, branchName) => `${branchName}-${moduleName}-${moduleVersion}`;

const download = (url) => fetch(url).then((r) => r.arrayBuffer());

const getBufferFromStream = withSection("buffer from stream", async (span, stream) => {
	const chunks = [];

	stream.read();

	return await new Promise((resolve, reject) => {
		stream.on("data", (chunk) => chunks.push(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
});

// node uses quality level 11 by default which is INSANE
const brotlify = withSection("brotli", (span, buf) =>
	brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
);

export const patch = withSection("v2 module patcher", async (span, m, branchName) => {
	const cacheName = getCacheName("discord_desktop_core", m.module_version, branchName);

	const cached = v2ModuleCache.get(cacheName);
	if (cached) {
		if (cached.metadata.sourceSha256 === m.package_sha256 && cached.metadata.finalSha256) {
			reportV2Cached();
			return cached.metadata.finalSha256;
		} else {
			// evict cache
			v2ModuleCache.delete(cacheName, "source hash mismatch");
		}
	}
	reportV2Patched();

	await ensureBranchIsReady(branchName);

	const branch = getBranch(branchName);

	const brotli = await section("download original module", async () => {
		const data = await download(m.url);
		return brotliDecompressSync(data);
	});

	const buildDir = createCacheTempDir("v2-module");
	const eDir = join(buildDir, "extract");
	const filesDir = join(eDir, "files");
	mkdirSync(eDir, { recursive: true });

	try {
		await section("extract original module", async () => {
			const stream = Readable.from(brotli);

			const xTar = stream.pipe(
				tar.x({
					cwd: eDir,
				}),
			);

			await new Promise((res, rej) => {
				xTar.on("finish", () => res());
				xTar.on("error", rej);
			});
		});

		const allFiles = section("patch module files", () => {
			let deltaManifest = JSON.parse(readFileSync(join(eDir, "delta_manifest.json"), "utf8"));

			const moddedIndex = dcMain.replace("// __BRANCHES_MAIN__", branch.main);
			writeFileSync(join(filesDir, "index.js"), moddedIndex);
			deltaManifest.files["index.js"] = { New: { Sha256: sha256(moddedIndex) } };

			const moddedPreload = dcPreload.replace("// __BRANCHES_PRELOAD__", branch.preload);
			writeFileSync(join(filesDir, "preload.js"), moddedPreload);
			deltaManifest.files["preload.js"] = { New: { Sha256: sha256(moddedPreload) } };

			const availableBranches = JSON.stringify(getSingleBranchMetas(), null, 4);
			writeFileSync(join(filesDir, "branches.json"), availableBranches);
			deltaManifest.files["branches.json"] = { New: { Sha256: sha256(availableBranches) } };

			for (const cacheDir of branch.cacheDirs) {
				cpSync(cacheDir, filesDir, { recursive: true });
			}

			const allFiles = glob.sync(`${filesDir}/**/*.*`);
			for (const f of allFiles) {
				// The updater always expects '/' as separator in delta_manifest.json (regardless of platform)
				const key = relative(filesDir, f).replaceAll(win32.sep, posix.sep);

				deltaManifest.files[key] = {
					New: {
						Sha256: sha256(readFileSync(f)),
					},
				};
			}

			writeFileSync(join(eDir, "delta_manifest.json"), JSON.stringify(deltaManifest));

			return allFiles;
		});

		return await section("compress final module", async () => {
			const tarStream = tar.c(
				{
					cwd: eDir,
				},
				["delta_manifest.json", ...allFiles.map((f) => relative(eDir, f))],
			);

			const tarBuffer = await getBufferFromStream(tarStream);

			const final = brotlify(tarBuffer);

			const finalHash = sha256(final);

			const cached = v2ModuleCache.set(cacheName, final, {
				sourceSha256: m.package_sha256,
				finalSha256: finalHash,
			});

			if (!cached)
				throw new Error(`failed to cache patched v2 module ${cacheName}: cache may be disabled or too small`);

			return finalHash;
		});
	} finally {
		rmSync(buildDir, { force: true, recursive: true });
	}
});

export const getFinal = withSection("v2 module patcher", (span, req) => {
	const moduleName = req.param("moduleName");
	const moduleVersion = req.param("moduleVersion");
	const branchName = req.param("branch");
	const cacheName = getCacheName(moduleName, moduleVersion, branchName);
	const cached = v2ModuleCache.get(cacheName);

	span.setAttribute("module_patcher.cache_name", cacheName);

	if (!cached) {
		// this cache entry is missing or expired; the client should request the manifest again
		// this can only happen if the cache is disabled or too small, or the client has a *very* outdated manifest
		// and tries to fetch an old module. the latter case *should* not be possible to hit.
		span.addEvent("patched module was not found in cache; is cache disabled or too small?");
		span.setStatus({ code: SpanStatusCode.ERROR });
		return;
	}

	return cached.body;
});

// export const getChecksum = async (m, branch) => sha256(await patch(m, branch));
