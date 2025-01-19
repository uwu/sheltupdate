import { readFileSync, writeFileSync, cpSync, createWriteStream, rmSync } from "fs";

import stream from "stream";
import { join } from "path";

import unzipper from "unzipper";
import archiver from "archiver";

import basicProxy from "../../common/proxy/index.js";
import { ensureBranchIsReady, getBranch, getSingleBranchMetas } from "../../common/branchesLoader.js";
import { log, withLogSection } from "../../common/logger.js";
import { dcMain, dcPreload } from "../../desktopCore/index.js";

export default withLogSection("module patcher", async (c, cacheDir, cacheFinalFile) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();
	//const { platform, host_version } = c.req.query();

	// wait for branch to be ready!
	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	log("patching discord_desktop_core");

	const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);

	let s = stream.Readable.from(prox.body);

	const cacheExtractDir = join(cacheDir, "extract" + Math.random().toString(16));

	let t = s.pipe(unzipper.Extract({ path: cacheExtractDir }));

	log("waiting on network...");

	await new Promise((res) => t.on("close", res));

	log("copying files...");

	for (const cacheDir of branch.cacheDirs) {
		cpSync(cacheDir, cacheExtractDir, { recursive: true });
	}

	writeFileSync(join(cacheExtractDir, "index.js"), dcMain.replace("__BRANCHES_MAIN__", branch.patch));
	writeFileSync(join(cacheExtractDir, "preload.js"), dcPreload.replace("__BRANCHES_PRELOAD__", branch.preload));
	writeFileSync(join(cacheExtractDir, "branches.json"), JSON.stringify(getSingleBranchMetas(), null, 4));

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

	rmSync(cacheExtractDir, { recursive: true });

	c.header("Content-Type", "application/zip");
	return c.body(readFileSync(cacheFinalFile));
});
