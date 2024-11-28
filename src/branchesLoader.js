import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

import glob from "glob";
import {srcDir} from "./config.js";

export let branches = {};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const init = () => {
	const dirs = glob.sync(join(srcDir, "..", "branches", "*", "*"));

	console.log("Loading branches...", dirs);

	for (let d of dirs) {
		const splits = d.split("/");

		const name = splits.pop();
		const type = splits.pop();

		//const filePaths = glob.sync(`${d}/**/*`).filter((x) => x.match(/.*\..*$/));
		/*
    console.log(name, filePaths);

    let files = [];

    for (let f of filePaths) {
      files.push({
        path: f,
        content: fs.readFileSync(f)
      });
    }*/

		let files = glob.sync(`${d}/*`);

		let patch = "";
		for (const f of files) {
			const filename = f.split("/").pop();

			if (filename === "patch.js") {
				patch = readFileSync(f, "utf8");
				files.splice(files.indexOf(f), 1);
			}
		}

		let fileHashes = [];

		for (const f of glob.sync(`${d}/**/*.*`)) {
			const content = readFileSync(f);

			const baseHash = sha256(content);

			fileHashes.push(baseHash);
		}

		const version = parseInt(sha256(fileHashes.join(" ")).substring(0, 2), 16);

		branches[name] = {
			files,
			patch,
			version,
			type,
		};

		console.log(d, branches[name]);
	}

	console.log("\nCreating mixed branches...");

	const branchNames = Object.keys(branches);

	let combinations = [[]];
	for (const value of branchNames) {
		const copy = [...combinations];
		for (const prefix of copy) {
			combinations.push(prefix.concat(value));
		}
	}

	combinations = combinations.filter((x) => x.length > 1);

	for (const original of combinations) {
		const reverse = original.slice().reverse();

		for (const c of [reverse, original]) {
			const key = c.join("+");

			const b = c.map((x) => branches[x]);

			branches[key] = {
				files: b.map((x) => x.files).reduce((x, a) => a.concat(x), []),
				patch: b.map((x) => x.patch).reduce((x, a) => `${x}\n{\n${a}\n}`, ""),
				version: parseInt(b.map((x) => x.version).reduce((x, a) => `${x}0${a}`)),
				type: "mixed",
			};
		}
	}

	// console.log(branches);
};

init();