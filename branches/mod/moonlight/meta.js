import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { Readable, Writable } from "stream";
import tar from "tar";

export const name = "Moonlight";
export const description = "Injects moonlight; This is not an officially supported moonlight install method";
export const incompatibilities = ["vencord", "equicord", "betterdiscord"];

export async function setup(target, log) {
	log("Downloading latest bundle...");

	const url = await fetch("https://api.github.com/repos/moonlight-mod/moonlight/releases/latest")
		.then((r) => r.json())
		.then((j) => j.assets.find((a) => a.name === "dist.tar.gz").browser_download_url);

	if (typeof target === "string") {
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
	} else {
		const fileRes = await fetch(url);
		const buf = Buffer.from(await fileRes.arrayBuffer());

		const { gunzipSync } = await import("zlib");
		const tarBuf = gunzipSync(buf);

		const tarStream = (await import("tar-stream")).default;
		const extract = tarStream.extract();

		const done = new Promise((resolve, reject) => {
			extract.on("entry", (header, stream, next) => {
				if (header.type !== "file") {
					stream.resume();
					next();
					return;
				}
				const chunks = [];
				stream.on("data", (chunk) => chunks.push(chunk));
				stream.on("end", () => {
					target.writeFile(`moonlight/${header.name}`, Buffer.concat(chunks));
					next();
				});
				stream.on("error", reject);
			});
			extract.on("finish", resolve);
			extract.on("error", reject);
		});

		Readable.from(tarBuf).pipe(extract);
		await done;
	}

	log("Done!");
}
