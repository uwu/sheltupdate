import { rm, readFile, writeFile } from "fs/promises";
import { createWriteStream, rmSync } from "fs";
import { join } from "path";
import { createPackage, extractAll } from "@electron/asar";
import { Writable } from "stream";

export const name = "Kernel";
export const description = "Injects Kernel; WIP, broken, do not use";

// this branch does not work. hide it from the GUI.
export const hidden = true;

export async function setup(target, log) {
	log("Downloading latest asar...");

	const url = await fetch("https://api.github.com/repos/kernel-mod/electron/releases/latest")
		.then((r) => r.json())
		.then((j) => j.assets.find((a) => a.browser_download_url?.includes(".asar")).browser_download_url);

	const asarPath = join(target, "kernel.asar");

	const fileRes = await fetch(url);

	// pipe into file
	await rm(asarPath, { force: true });
	await fileRes.body.pipeTo(Writable.toWeb(createWriteStream(asarPath)));

	log("Patching out scheme CSP bypass...");

	// patch out platform check; extract everything
	const exPath = join(target, "ex");
	extractAll(asarPath, exPath);
	const istr = await readFile(join(target, "ex/main/registerProtocols.js"), "utf8");

	const patched = istr.replaceAll(
		/_electron\.protocol\.registerSchemesAsPrivileged.*_electron\.app\.on\("r/g,
		'_electron.app.on("r',
	);

	await writeFile(join(target, "ex/main/registerProtocols.js"), patched);

	await createPackage(exPath, asarPath);

	rmSync(exPath, { recursive: true });

	log("Done!");
}
