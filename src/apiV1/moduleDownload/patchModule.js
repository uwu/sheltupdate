import { readFileSync, writeFileSync, cpSync, createWriteStream, rmSync, mkdirSync } from "fs";

import stream from "stream";
import { join } from "path";

import unzipper from "unzipper";
import archiver from "archiver";

import basicProxy from "../../common/proxy/index.js";
import { ensureBranchIsReady, getBranch, getSingleBranchMetas } from "../../common/branchesLoader.js";
import { createCacheTempDir } from "../../common/cacheStores.js";
import { section, withSection } from "../../common/tracer.js";
import { dcMain, dcPreload } from "../../desktopCore/index.js";

export default withSection("v1 module patcher", async (span, c) => {
	const { branch: branch_, /*channel,*/ version } = c.req.param();
	//const { platform, host_version } = c.req.query();

	// wait for branch to be ready!
	await ensureBranchIsReady(branch_);

	const branch = getBranch(branch_);

	const cacheBuildDir = createCacheTempDir("v1-module");
	const cacheExtractDir = join(cacheBuildDir, "extract");
	const cacheFinalFile = join(cacheBuildDir, "module.zip");
	mkdirSync(cacheExtractDir, { recursive: true });

	try {
		const s = await section("download original module", async () => {
			const prox = await basicProxy(c, {}, [version, version.substring(branch.version.toString().length)]);

			let s = stream.Readable.from(prox.body);

			let t = s.pipe(unzipper.Extract({ path: cacheExtractDir }));

			await new Promise((res, rej) => {
				t.on("close", res);
				t.on("error", rej);
			});

			return s;
		});

		section("copy files", () => {
			for (const cacheDir of branch.cacheDirs) {
				cpSync(cacheDir, cacheExtractDir, { recursive: true });
			}

			writeFileSync(join(cacheExtractDir, "index.js"), dcMain.replace("// __BRANCHES_MAIN__", branch.main));
			writeFileSync(
				join(cacheExtractDir, "preload.js"),
				dcPreload.replace("// __BRANCHES_PRELOAD__", branch.preload),
			);
			writeFileSync(join(cacheExtractDir, "branches.json"), JSON.stringify(getSingleBranchMetas(), null, 4));
		});

		await section("create module zip", async () => {
			const outputStream = createWriteStream(`${cacheFinalFile}`);

			const archive = archiver("zip");

			archive.pipe(outputStream);

			archive.directory(cacheExtractDir, false);

			archive.finalize();

			await new Promise((res, rej) => {
				outputStream.on("close", res);
				outputStream.on("error", rej);
				archive.on("error", rej);
			});

			s.destroy();

			outputStream.close();
			outputStream.destroy();
		});

		return readFileSync(cacheFinalFile);
	} finally {
		rmSync(cacheBuildDir, { recursive: true, force: true });
	}
});
