import { rm } from "fs/promises";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { Writable } from "stream";

export const name = "Equicord";
export const description = "Injects Equicord (Vencord Fork); This is not an officially supported Equicord install method";

export async function setup(target, log) {
	const releaseUrl = "https://github.com/Equicord/Equicord/releases/download/latest/";
	
	mkdirSync(join(target, "equicord-desktop"), { recursive: true });

	for (const f of ["equicordDesktopMain.js", "equicordDesktopPreload.js", "renderer.js", "renderer.css"]) {
		log(`Downloading ${f}...`);

		const p = join(target, "equicord-desktop", f);
		await rm(p, { force: true });

		const req = await fetch(releaseUrl + f);
		await req.body.pipeTo(Writable.toWeb(createWriteStream(p)));
	}

	log("Done!");
}
