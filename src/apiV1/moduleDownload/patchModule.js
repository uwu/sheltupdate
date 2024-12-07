import {
	readFileSync,
	writeFileSync,
	mkdirSync,
	readdirSync,
	lstatSync,
	copyFileSync,
	createWriteStream,
	rmdirSync,
} from "fs";

import stream from "stream";
import path from "path";

import unzipper from "unzipper";
import archiver from "archiver";

import basicProxy from "../../common/proxy/index.js";
import { ensureBranchIsReady, getBranch } from "../../common/branchesLoader.js";
import { finalizeDesktopCoreIndex, finalizeDesktopCorePreload } from "../../common/desktopCoreTemplates.js";
import { log, withLogSection } from "../../common/logger.js";

export default withLogSection("module patcher", async (c, cacheDir, cacheFinalFile) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();
	//const { platform, host_version } = c.req.query();

	// wait for branch to be ready!
	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	log("patching discord_desktop_core");

	const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);

	let s = stream.Readable.from(prox.body);

	const cacheExtractDir = `${cacheDir}/extract` + Math.random().toString(16);

	let t = s.pipe(unzipper.Extract({ path: `${cacheExtractDir}` }));

	log("waiting on network...");

	await new Promise((res) => t.on("finish", res));

	log("copying files...");

	writeFileSync(`${cacheExtractDir}/index.js`, finalizeDesktopCoreIndex(branch.patch, !!branch.preload));
	if (branch.preload) writeFileSync(`${cacheExtractDir}/preload.js`, finalizeDesktopCorePreload(branch.preload));

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
		if (lstatSync(f).isDirectory()) {
			copyFolderSync(f, `${cacheExtractDir}/${f.split("/").pop()}`);
		} else {
			copyFileSync(f, `${cacheExtractDir}/${f.split("/").pop()}`);
		}
	}

	log("creating module zip...");

	const outputStream = createWriteStream(`${cacheFinalFile}`);

	const archive = archiver("zip");

	archive.pipe(outputStream);

	archive.directory(cacheExtractDir, false);

	archive.finalize();

	await new Promise((res) => outputStream.on("close", res));

	log("finished patching module!");

	s.destroy();

	outputStream.close();
	outputStream.destroy();

	rmdirSync(cacheExtractDir);

	c.header("Content-Type", "application/zip");
	return c.body(readFileSync(cacheFinalFile));
});
