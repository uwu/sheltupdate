import { Readable } from "stream";
import { createHash } from "crypto";

import { mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, copyFileSync, existsSync } from "fs";
import { join, resolve, basename, relative } from "path";

import tar from "tar";

import { brotliDecompressSync, brotliCompressSync, constants } from "zlib";
import { ensureBranchIsReady, getBranch } from "../common/branchesLoader.js";
import { finalizeDesktopCoreIndex, finalizeDesktopCorePreload } from "../common/desktopCoreTemplates.js";
import { log, withLogSection } from "../common/logger.js";
import { cacheBase } from "../common/fsCache.js";

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

// this is called by /manifest, and causes us to pre-emptively create and cache
// module for single branches, and it returns the relevant sha256
// these cached fake modules will later be used to construct the full patched discord_desktop_core.
export const createModule = withLogSection("module patcher", async (branchName, branch) => {
	const moduleName = `goose_${branchName}`;
	const cacheName = getCacheName(moduleName, branch.version, "custom");

	const cached = cache.created[cacheName];
	if (cached) return cached.hash;

	log(`creating custom module ${moduleName}`);

	const eDir = join(cacheBase, cacheName, "extract");
	const filesDir = join(eDir, "files");
	if (!existsSync(filesDir)) {
		mkdirSync(filesDir, { recursive: true });
	}

	let deltaManifest = {
		manifest_version: 1,
		files: {},
	};

	log(`copying branch files...`);

	let files = [];

	function copyFolderSync(from, to) {
		mkdirSync(to);
		readdirSync(from).forEach((element) => {
			const outPath = resolve(join(to, element));
			if (lstatSync(join(from, element)).isFile()) {
				files.push(outPath);
				copyFileSync(join(from, element), outPath);
			} else {
				copyFolderSync(join(from, element), outPath);
			}
		});
	}

	for (let f of branch.files) {
		const outPath = join(filesDir, basename(f));
		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, outPath);
		} else {
			files.push(outPath);
			copyFileSync(f, outPath);
		}
	}

	const indexPath = join(filesDir, "index.js");
	writeFileSync(indexPath, branch.patch);
	files.push(indexPath);

	if (branch.preload) {
		const preloadPath = join(filesDir, "preload.js");
		writeFileSync(preloadPath, branch.preload);
		files.push(preloadPath);
	}

	for (let f of files) {
		const key = relative(filesDir, f);

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
		["delta_manifest.json", ...files.map((f) => relative(eDir, f))],
	);

	const tarBuffer = await getBufferFromStream(tarStream);

	log(`compressing...`);

	const final = brotlify(tarBuffer);

	const finalHash = sha256(final);

	cache.created[cacheName] = {
		hash: finalHash,
		final,
	};

	log(`finished creating custom module!`);

	return finalHash;
});

export const patch = withLogSection("module patcher", async (m, branchName) => {
	const cacheName = getCacheName("discord_desktop_core", m.module_version, branchName);

	const cached = cache.patched[cacheName];
	if (cached) return cached.hash;

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
		deltaManifest.files["preload.js"] = { New: { Sha256: sha256(moddedPreload) } };
	}

	let files = [];

	function copyFolderSync(from, to) {
		mkdirSync(to);
		readdirSync(from).forEach((element) => {
			const outPath = resolve(join(to, element));
			if (lstatSync(join(from, element)).isFile()) {
				files.push(outPath);
				copyFileSync(join(from, element), outPath);
			} else {
				copyFolderSync(join(from, element), outPath);
			}
		});
	}

	for (let f of branch.files) {
		const dest = join(filesDir, basename(f));
		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, dest);
		} else {
			files.push(dest);
			copyFileSync(f, dest);
		}
	}

	for (let f of files) {
		const key = relative(filesDir, f);

		deltaManifest.files[key] = {
			New: {
				Sha256: sha256(readFileSync(f)),
			},
		};
	}

	writeFileSync(join(eDir, "delta_manifest.json"), JSON.stringify(deltaManifest));

	writeFileSync(join(filesDir, "index.js"), moddedIndex);
	if (moddedPreload) writeFileSync(join(filesDir, "preload.js"), moddedPreload);

	log(`creating module tar...`);

	const tarStream = tar.c(
		{
			cwd: eDir,
		},
		[
			"delta_manifest.json",
			join("files", "core.asar"),
			join("files", "index.js"),
			...(branch.preload ? [join("files", "preload.js")] : []),
			join("files", "package.json"),
			...files.map((f) => relative(eDir, f)),
		],
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
