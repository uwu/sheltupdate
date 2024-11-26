import { Readable } from "stream";
import { createHash } from "crypto";

import { mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, copyFileSync } from "fs";
import { join, resolve } from "path";

import tar from "tar";
import axios from "axios";

import { brotliDecompressSync, brotliCompressSync } from "zlib";

const cacheBase = "../cache";

const desktopCoreBase = `module.exports = require('./core.asar');`;

let cache = {
	patched: {},
	created: {},
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const getCacheName = (moduleName, moduleVersion, branchName) => `${branchName}-${moduleName}-${moduleVersion}`;

const download = async (url) =>
	(
		await axios.get(url, {
			responseType: "arraybuffer",
		})
	).data;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getBufferFromStream = async (stream) => {
	const chunks = [];

	stream.read();

	return await new Promise((resolve, reject) => {
		stream.on("data", (chunk) => chunks.push(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
};

export const createModule = async (branchName, branch) => {
	const moduleName = `goose_${branchName}`;
	const cacheName = getCacheName(moduleName, branch.version, "custom");

	const cached = cache.created[cacheName];
	if (cached) return cached.hash;

	const eDir = `${cacheBase}/${cacheName}/extract`;
	mkdirSync(eDir, { recursive: true });
	mkdirSync(`${eDir}/files`);

	let deltaManifest = {
		manifest_version: 1,
		files: {},
	};

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

	for (let f of files) {
		const key = f
			.replace(/\\/g, "/")
			.replace(new RegExp(`${eDir.replace("+", "\\+").replace("..", ".*")}/files/`), "");

		deltaManifest.files[key] = {
			New: {
				Sha256: sha256(readFileSync(f)),
			},
		};

		console.log(key, deltaManifest.files[key].New.Sha256);
	}

	writeFileSync(`${eDir}/delta_manifest.json`, JSON.stringify(deltaManifest));

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

	const final = brotliCompressSync(tarBuffer);

	console.log(final);

	const finalHash = sha256(final);

	cache.created[cacheName] = {
		hash: finalHash,
		final,
	};

	return finalHash;
};

export const patch = async (m, branchName) => {
	const cacheName = getCacheName("discord_desktop_core", m.module_version, branchName);

	console.log("patch", cache, cacheName);

	const cached = cache.patched[cacheName];
	if (cached) return cached.hash;

	const branch = branches[branchName];

	console.log(m.url);

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

	console.log("extracting");

	await new Promise((res) => {
		xTar.on("finish", () => res());
	});

	// await sleep(3000);

	console.log("extracted");

	console.log("patching extracted files");

	let deltaManifest = JSON.parse(readFileSync(`${eDir}/delta_manifest.json`));

	const moddedIndex = `${branchName
		.split("+")
		.map((x) => `require('../../goose_${x}-${branches[x].version}/goose_${x}/index.js');`)
		.join("\n")}

${desktopCoreBase}`;
	//`${branch.patch}\n\n${desktopCoreBase};

	deltaManifest.files["index.js"].New.Sha256 = sha256(moddedIndex);

	console.log("adding extra branch files");

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

	/* for (let f of branch.files) {
    if (lstatSync(f).isDirectory()) {
      copyFolderSync(f, `${eDir}/files/${f.split('/').pop()}`)
    } else {
      // add this to files later once branches use top-level files
      copyFileSync(f, `${eDir}/files/${f.split('/').pop()}`);
    }
  }

  for (let f of files) {
    const key = f.replace(/\\/g, '/').replace(new RegExp(`${eDir.replace('+', '\\+').replace('..', '.*')}/files/`), '');

    deltaManifest.files[key] = {
      New: {
        Sha256: sha256(readFileSync(f))
      }
    };

    console.log(key, deltaManifest.files[key].New.Sha256);
  } */

	console.log(deltaManifest);

	console.log("writing patched files");

	writeFileSync(`${eDir}/delta_manifest.json`, JSON.stringify(deltaManifest));

	writeFileSync(`${eDir}/files/index.js`, moddedIndex);

	console.log("creating new tar");

	const tarStream = tar.c(
		{
			cwd: eDir,
		},
		[
			"delta_manifest.json",
			"files/core.asar",
			"files/index.js",
			"files/package.json",
			//...(files.map((x) => x.replace(/\\/g, '/').replace(new RegExp(`${eDir.replace('+', '\\+').replace('..', '.*')}/`), '')))
		],
	);

	const tarBuffer = await getBufferFromStream(tarStream);

	const final = brotliCompressSync(tarBuffer);

	/*let deltaManifest = await new Promise((resolve, reject) => {
    stream.pipe(
      tar.t({
        onentry: async (entry) => {
          console.log(entry.path);
          if (entry.path === 'delta_manifest.json') {
            resolve(JSON.parse(await getContentsFromEntry(entry)));
          }
        }
      })
    )
  });

  const moddedIndex = `${branch.patch}
  
${desktopCoreBase}`;

  deltaManifest.files['index.js'].New.Sha256 = sha256(moddedIndex);

  console.log(deltaManifest);

  const eoDir = `${cacheBase}/${cacheName}/extractOverwrite`;
  mkdirSync(eoDir, { recursive: true });
  mkdirSync(`${eoDir}/files`, { recursive: true });

  writeFileSync(`${eoDir}/delta_manifest.json`, JSON.stringify(deltaManifest));
  writeFileSync(`${eoDir}/files/index.js`, moddedIndex);

  writeFileSync(`${cacheBase}/${cacheName}/tar.tar`, brotli);

  await tar.r({
      f: `${cacheBase}/${cacheName}/tar.tar`,
      cwd: eoDir
    }, [
      `delta_manifest.json`,
      `files/index.js`
    ]);

  const final = brotliCompressSync(readFileSync(`${cacheBase}/${cacheName}/tar.tar`));*/

	console.log(final);

	const finalHash = sha256(final);

	cache.patched[cacheName] = {
		hash: finalHash,
		final,
	};

	return finalHash;
};

export const getCustomFinal = (req) => {
	const cached =
		cache.created[
			getCacheName(req.params.moduleName, branches[req.params.moduleName.substring(6)].version, "custom")
		];

	if (!cached) {
		return;
	}

	return cached.final;
};

export const getFinal = (req) => {
	const cached = cache.patched[getCacheName(req.params.moduleName, req.params.moduleVersion, req.params.branch)];

	console.log("getFinal", cache, getCacheName(req.params.moduleName, req.params.moduleVersion, req.params.branch));

	if (!cached) {
		// uhhh it should always be
		return;
	}

	return cached.final;
};

// export const getChecksum = async (m, branch) => sha256(await patch(m, branch));
