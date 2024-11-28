import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, copyFileSync, createWriteStream } from "fs";

import stream from "stream";
import path from "path";

import unzipper from "unzipper";
import archiver from "archiver";

import basicProxy from "../../common/proxy/index.js";
import {branches} from "../../common/branchesLoader.js";
import {
	finalizeDesktopCoreIndex,
	finalizeDesktopCorePreload
} from "../../common/desktopCoreTemplates.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async (c, cacheDir, cacheFinalFile) => {
	const {branch: branch_, channel, version} = c.req.param();
	const {platform, host_version} = c.req.query();

	const branch = branches[branch_];

	console.log("[CustomModule] Could not find cache dir, creating custom version");

	const prox = await basicProxy(
		c, {},
		[version, version.substring(branch.version.toString().length)],
	);

	console.time("fromNetwork");

	let s = stream.Readable.from(prox.body);

	const cacheExtractDir = `${cacheDir}/extract`;

	let t = s.pipe(unzipper.Extract({ path: `${cacheExtractDir}` }));

	console.log("waiting");

	await new Promise((res) => t.on("finish", res));
	await sleep(100);

	console.log("waited");

	console.log("Extract finished");

	console.time("fromExtract");

	console.log("Patching file");

	writeFileSync(`${cacheExtractDir}/index.js`, finalizeDesktopCoreIndex(branch.patch, !!branch.preload));
	if (branch.preload)
		writeFileSync(`${cacheExtractDir}/preload.js`, finalizeDesktopCorePreload(branch.preload));

	console.log("Copying other files");

	function copyFolderSync(from, to) {
		mkdirSync(to);
		readdirSync(from).forEach((element) => {
			if (lstatSync(path.join(from, element)).isFile()) {
				copyFileSync(path.join(from, element), path.join(to, element));
			} else {
				copyFolderSync(path.join(from, element), path.join(to, element));
			}
		});
	}

	for (let f of branch.files) {
		console.log(f, f.split("/").pop());

		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, `${cacheExtractDir}/${f.split("/").pop()}`);
		} else {
			copyFileSync(f, `${cacheExtractDir}/${f.split("/").pop()}`);
		}
	}

	console.log("Creating new final zip");

	const outputStream = createWriteStream(`${cacheFinalFile}`);

	const archive = archiver("zip");

	archive.pipe(outputStream);

	archive.directory(cacheExtractDir, false);

	archive.finalize();

	console.log("Waiting for archive to finish");

	await new Promise((res) => outputStream.on("close", res));

	console.log("Finished - sending file");

	console.timeEnd("fromNetwork");
	console.timeEnd("fromExtract");

	s.destroy();

	outputStream.close();
	outputStream.destroy();

	c.header("Content-Type", "application/zip")
	return c.body(readFileSync(cacheFinalFile));
};
