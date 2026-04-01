import { readFileSync, writeFileSync, cpSync, createWriteStream, rmSync } from "fs";

import stream from "stream";
import { join } from "path";

import unzipper from "unzipper";
import archiver from "archiver";

import basicProxy from "../../common/proxy/index.js";
import { ensureBranchIsReady, getBranch, getSingleBranchMetas } from "../../common/branchesLoader.js";
import { section, withSection } from "../../common/tracer.js";
import { dcMain, dcPreload } from "../../desktopCore/index.js";
import { inMemory } from "../../common/fsCache.js";
import { readZip, writeZip, overlayFiles, setText, streamToBuffer } from "../../common/virtualFiles.js";

const patchInMemory = withSection("v1 module patcher", async (span, c) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();

	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	const zipBuffer = await section("download original module", async () => {
		const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);
		return await streamToBuffer(stream.Readable.from(prox.body));
	});

	const files = await section("extract original module", () => readZip(zipBuffer));

	section("patch files", () => {
		overlayFiles(files, branch.extraFiles);
		setText(files, "index.js", dcMain.replace("// __BRANCHES_MAIN__", branch.main));
		setText(files, "preload.js", dcPreload.replace("// __BRANCHES_PRELOAD__", branch.preload));
		setText(files, "branches.json", JSON.stringify(getSingleBranchMetas(), null, 4));
	});

	return await section("create module zip", () => writeZip(files));
});

const patchFs = withSection("v1 module patcher", async (span, c, cacheDir, cacheFinalFile) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();
	//const { platform, host_version } = c.req.query();

	// wait for branch to be ready!
	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	const cacheExtractDir = join(cacheDir, "extract" + Math.random().toString(16));

	const s = await section("download original module", async () => {
		const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);

		let s = stream.Readable.from(prox.body);

		let t = s.pipe(unzipper.Extract({ path: cacheExtractDir }));

		await new Promise((res) => t.on("close", res));

		return s;
	});

	section("copy files", () => {
		for (const cacheDir of branch.cacheDirs) {
			cpSync(cacheDir, cacheExtractDir, { recursive: true });
		}

		writeFileSync(join(cacheExtractDir, "index.js"), dcMain.replace("// __BRANCHES_MAIN__", branch.main));
		writeFileSync(join(cacheExtractDir, "preload.js"), dcPreload.replace("// __BRANCHES_PRELOAD__", branch.preload));
		writeFileSync(join(cacheExtractDir, "branches.json"), JSON.stringify(getSingleBranchMetas(), null, 4));
	});

	await section("create module zip", async () => {
		const outputStream = createWriteStream(`${cacheFinalFile}`);

		const archive = archiver("zip");

		archive.pipe(outputStream);

		archive.directory(cacheExtractDir, false);

		archive.finalize();

		await new Promise((res) => outputStream.on("close", res));

		s.destroy();

		outputStream.close();
		outputStream.destroy();

		rmSync(cacheExtractDir, { recursive: true });
	});

	c.header("Content-Type", "application/zip");
	return c.body(readFileSync(cacheFinalFile));
});

export default inMemory ? patchInMemory : patchFs;
