import { rm } from "fs/promises";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { Writable } from "stream";

export const name = "Vencord";
export const description = "Injects Vencord; This is not an officially supported Vencord install method";

export async function setup(target, log) {
	const releaseUrl = "https://github.com/Vendicated/Vencord/releases/download/devbuild/";

	mkdirSync(join(target, "vencord-desktop"), { recursive: true });

	for (const f of ["vencordDesktopMain.js", "vencordDesktopPreload.js", "renderer.js", "vencordDesktopRenderer.css"]) {
		log(`Downloading ${f}...`);

		const p = join(target, "vencord-desktop", f);
		await rm(p, { force: true });

		const req = await fetch(releaseUrl + f);
		await req.body.pipeTo(Writable.toWeb(createWriteStream(p)));
	}

	log("Done!");
}
