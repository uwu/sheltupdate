import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from "fs";

import stream from "stream";
import { join, relative, posix, win32 } from "path";

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

const collectFiles = (dir) => {
	const files = new Map();
	const walk = (d) => {
		for (const entry of readdirSync(d)) {
			const full = join(d, entry);
			if (statSync(full).isDirectory()) walk(full);
			else files.set(relative(dir, full).replaceAll(win32.sep, posix.sep), readFileSync(full));
		}
	};
	walk(dir);
	return files;
};

const patchFs = withSection("v1 module patcher", async (span, c, cacheDir, cacheFinalFile) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();
	//const { platform, host_version } = c.req.query();

	// wait for branch to be ready!
	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	const cacheExtractDir = join(cacheDir, "extract" + Math.random().toString(16));

	await section("download and extract original module", async () => {
		const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);
		const zipBuffer = await streamToBuffer(stream.Readable.from(prox.body));
		const files = await readZip(zipBuffer);

		mkdirSync(cacheExtractDir, { recursive: true });
		for (const [path, data] of files) {
			const dest = join(cacheExtractDir, path);
			mkdirSync(join(dest, ".."), { recursive: true });
			writeFileSync(dest, data);
		}
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
		const files = collectFiles(cacheExtractDir);
		const finalBuf = await writeZip(files);
		writeFileSync(cacheFinalFile, finalBuf);
		rmSync(cacheExtractDir, { recursive: true });
	});

	c.header("Content-Type", "application/zip");
	return c.body(readFileSync(cacheFinalFile));
});

export default inMemory ? patchInMemory : patchFs;
