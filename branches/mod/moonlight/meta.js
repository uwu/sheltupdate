import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { Writable } from "stream";
import tar from "tar";

export const name = "Moonlight";
export const description = "Injects moonlight; This is not an officially supported moonlight install method";
export const incompatibilities = ["vencord", "equicord", "betterdiscord"];

export async function setup(target, log) {
	log("Downloading latest bundle...");

	const url = await fetch("https://api.github.com/repos/moonlight-mod/moonlight/releases/latest")
		.then((r) => r.json())
		.then((j) => j.assets.find((a) => a.browser_download_url?.includes(".tar.gz")).browser_download_url);

	const moonlightPath = join(target, "moonlight");
	const fileRes = await fetch(url);

	await rm(moonlightPath, { recursive: true, force: true });
	await mkdir(moonlightPath);

	await fileRes.body.pipeTo(
		Writable.toWeb(
			tar.x({
				cwd: moonlightPath,
			}),
		),
	);

	log("Done!");
}
