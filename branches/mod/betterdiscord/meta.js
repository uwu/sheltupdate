import { rm } from "fs/promises";
import { createWriteStream } from "fs";
import { join } from "path";
import { Writable } from "stream";

export const name = "BetterDiscord";
export const description = "Injects BetterDiscord; This is not an officially supported BetterDiscord install method";
export const incompatibilities = ["vencord", "moonlight"];

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

	log("Done!");
}
