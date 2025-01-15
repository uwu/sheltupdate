import { Readable } from "stream";
import { createHash } from "crypto";

import { mkdirSync, writeFileSync, readFileSync, cpSync } from "fs";
import { join, relative, win32, posix } from "path";

import tar from "tar";
import glob from "glob";

import { brotliDecompressSync, brotliCompressSync, constants } from "zlib";
import { ensureBranchIsReady, getBranch } from "../common/branchesLoader.js";
import { finalizeDesktopCoreIndex, finalizeDesktopCorePreload } from "../common/desktopCoreTemplates.js";
import { log, withLogSection } from "../common/logger.js";
import { cacheBase } from "../common/fsCache.js";
import { reportV2Cached, reportV2Patched } from "../dashboard/reporting.js";

const cache = {
	patched: {},
	created: {},
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const getCacheName = (moduleName, moduleVersion, branchName) => `${branchName}-${moduleName}-${moduleVersion}`;

const download = (url) => fetch(url).then((r) => r.arrayBuffer());

const getBufferFromStream = async (stream) => {
	const chunks = [];

	stream.read();

	return await new Promise((resolve, reject) => {
		stream.on("data", (chunk) => chunks.push(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
};

// node uses quality level 11 by default which is INSANE
const brotlify = (buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });

export const patch = withLogSection("module patcher", async (m, branchName) => {
	const cacheName = getCacheName("discord_desktop_core", m.module_version, branchName);

	const cached = cache.patched[cacheName];
	if (cached) {
		reportV2Cached();
		return cached.hash;
	}
	reportV2Patched();

	log(`patching desktop_core for ${branchName}`);

	await ensureBranchIsReady(branchName);

	const branch = getBranch(branchName);

	log(`waiting on network...`);

	const data = await download(m.url);
	const brotli = brotliDecompressSync(data);

	const stream = Readable.from(brotli);

	const eDir = join(cacheBase, cacheName, "extract");
	const filesDir = join(eDir, "files");
	mkdirSync(eDir, { recursive: true });

	const xTar = stream.pipe(
		tar.x({
			cwd: eDir,
		}),
	);

	log("extracting stock module...");

	await new Promise((res) => {
		xTar.on("finish", () => res());
	});

	log("patching module files...");

	let deltaManifest = JSON.parse(readFileSync(join(eDir, "delta_manifest.json"), "utf8"));

	const moddedIndex = finalizeDesktopCoreIndex(branch.patch, !!branch.preload);
	deltaManifest.files["index.js"].New.Sha256 = sha256(moddedIndex);

	let moddedPreload;
	if (branch.preload) {
		moddedPreload = finalizeDesktopCorePreload(branch.preload);
		writeFileSync(join(filesDir, "preload.js"), moddedPreload);
		deltaManifest.files["preload.js"] = { New: { Sha256: sha256(moddedPreload) } };
	}

	writeFileSync(join(filesDir, "index.js"), moddedIndex);

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

	log(`creating module tar...`);

	const tarStream = tar.c(
		{
			cwd: eDir,
		},
		["delta_manifest.json", ...allFiles.map((f) => relative(eDir, f))],
	);

	const tarBuffer = await getBufferFromStream(tarStream);

	log("compressing...");

	const final = brotlify(tarBuffer);

	const finalHash = sha256(final);

	cache.patched[cacheName] = {
		hash: finalHash,
		final,
	};

	log("finished patching module!");

	return finalHash;
});

export const getCustomFinal = (req) => {
	const moduleName = req.param("moduleName");
	const cached = cache.created[getCacheName(moduleName, getBranch(moduleName.substring(6)).version, "custom")];

	if (!cached) {
		return;
	}

	return cached.final;
};

export const getFinal = withLogSection("module patcher", (req) => {
	const moduleName = req.param("moduleName");
	const moduleVersion = req.param("moduleVersion");
	const branchName = req.param("branch");
	const cached = cache.patched[getCacheName(moduleName, moduleVersion, branchName)];

	log("serve final module", /*cache,*/ getCacheName(moduleName, moduleVersion, branchName));

	if (!cached) {
		log("module was not cached, this should never happen.");
		// uhhh it should always be
		return;
	}

	return cached.final;
});

// export const getChecksum = async (m, branch) => sha256(await patch(m, branch));
