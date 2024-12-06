import { Readable } from "stream";
import { createHash } from "crypto";

import { mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, copyFileSync, mkdtempSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

import tar from "tar";

import { brotliDecompressSync, brotliCompressSync, constants } from "zlib";
import { getBranch } from "../common/branchesLoader.js";
import { finalizeDesktopCoreIndex, finalizeDesktopCorePreload } from "../common/desktopCoreTemplates.js";
import {log, withLogSection} from "../common/logger.js";

const cacheBase = mkdtempSync(join(tmpdir(), "sheltupdate-cache-"));

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

	const eDir = `${cacheBase}/${cacheName}/extract`;
	mkdirSync(eDir, { recursive: true });
	mkdirSync(`${eDir}/files`);

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
		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, `${eDir}/files/${f.split("/").pop()}`);
		} else {
			const outPath = `${eDir}/files/${f.split("/").pop()}`;

			files.push(outPath);
			copyFileSync(f, outPath);
		}
	}

	writeFileSync(`${eDir}/files/index.js`, branch.patch);
	files.push(resolve(`${eDir}/files/index.js`));

	if (branch.preload) {
		writeFileSync(`${eDir}/files/preload.js`, branch.preload);
		files.push(resolve(`${eDir}/files/preload.js`));
	}

	for (let f of files) {
		const key = f
			.replace(/\\/g, "/")
			.replace(new RegExp(`${eDir.replace("+", "\\+").replace("..", ".*")}/files/`), "");

		deltaManifest.files[key] = {
			New: {
				Sha256: sha256(readFileSync(f)),
			},
		};
	}

	writeFileSync(`${eDir}/delta_manifest.json`, JSON.stringify(deltaManifest));

	log(`creating module tar...`);

	const tarStream = tar.c(
		{
			cwd: eDir,
		},
		[
			"delta_manifest.json",
			...files.map((x) =>
				x.replace(/\\/g, "/").replace(new RegExp(`${eDir.replace("+", "\\+").replace("..", ".*")}/`), ""),
			),
		],
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

	const branch = getBranch(branchName);

	log(`waiting on network...`);

	const data = await download(m.url);
	const brotli = brotliDecompressSync(data);

	const stream = Readable.from(brotli);

	const eDir = `${cacheBase}/${cacheName}/extract`;
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

	let deltaManifest = JSON.parse(readFileSync(`${eDir}/delta_manifest.json`, "utf8"));

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
		const dest = `${eDir}/files/${f.split("/").pop()}`;
		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, dest);
		} else {
			files.push(dest);
			copyFileSync(f, dest);
		}
	}

	for (let f of files) {
		const key = f
			.slice(eDir.length + "/files/".length)
			.replace(/\\/g, "/");

		deltaManifest.files[key] = {
			New: {
				Sha256: sha256(readFileSync(f)),
			},
		};
	}

	writeFileSync(`${eDir}/delta_manifest.json`, JSON.stringify(deltaManifest));

	writeFileSync(`${eDir}/files/index.js`, moddedIndex);
	if (moddedPreload) writeFileSync(`${eDir}/files/preload.js`, moddedPreload);

	log(`creating module tar...`);

	const tarStream = tar.c(
		{
			cwd: eDir,
		},
		[
			"delta_manifest.json",
			"files/core.asar",
			"files/index.js",
			...(branch.preload ? ["files/preload.js"] : []),
			"files/package.json",
			...files.map((x) => x.slice(eDir.length + 1).replace(/\\/g, "/")),
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
