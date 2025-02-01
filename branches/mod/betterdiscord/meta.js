import { rm, readFile, writeFile } from "fs/promises";
import { createWriteStream, rmSync } from "fs";
import { join } from "path";
import { createPackage, extractAll } from "@electron/asar";
import { Writable } from "stream";

export const name = "BetterDiscord";
export const description = "Injects BetterDiscord";
export const incompatibilities = ["vencord", "native_titlebar"];

export async function setup(target, log) {
	log("Downloading latest asar...");

	const url = await fetch("https://api.github.com/repos/BetterDiscord/BetterDiscord/releases/latest")
		.then((r) => r.json())
		.then((j) => j.assets.find((a) => a.browser_download_url?.includes(".asar")).browser_download_url);

	const asarPath = join(target, "betterdiscord.asar");

	const fileRes = await fetch(url);

	// pipe into file
	await rm(asarPath, { force: true });
	await fileRes.body.pipeTo(Writable.toWeb(createWriteStream(asarPath)));

	log("Patching out platform checks...");

	// patch out platform check; extract everything
	const exPath = join(target, "ex");
	extractAll(asarPath, exPath);
	const istr = await readFile(join(target, "ex/injector.js"), "utf8");

	const patched = istr.replaceAll(/"win32"==process.platform|"darwin"==process.platform/g, "false");

	await writeFile(join(target, "ex/injector.js"), patched);

	await createPackage(exPath, asarPath);

	rmSync(exPath, { recursive: true });

	log("Done!");
}
