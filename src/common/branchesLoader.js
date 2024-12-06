import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

import glob from "glob";
import { srcDir } from "./config.js";

/*export*/ let branches = {};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const orderingMap = new Map(); // string => number

const sortBranchesInPlace = (b) => {
	try {
		return b.sort((a, b) => {
			const oa = orderingMap.get(a);
			const ob = orderingMap.get(b);
			if (oa === undefined || ob === undefined) throw new Error("Invalid branch requested");

			return oa - ob;
		});
	} catch {
		return undefined;
	}
};

export const getBranch = (b) => branches[sortBranchesInPlace(b.split("+"))?.join("+")];

const init = () => {
	const dirs = glob.sync(join(srcDir, "..", "branches", "*", "*"));

	console.log("Loading branches...", dirs);

	for (let d of dirs) {
		const splits = d.split("/");

		const name = splits.pop();
		const type = splits.pop();

		let files = glob.sync(`${d}/*`);

		let patch = "";
		let preload = undefined; // optional
		for (let i = 0; i < files.length; i++) {
			const f = files[i];
			const filename = f.split("/").pop();

			if (filename === "patch.js") {
				patch = readFileSync(f, "utf8");
				files.splice(i--, 1);
			} else if (filename === "preload.js") {
				preload = readFileSync(f, "utf8");
				files.splice(i--, 1);
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
			preload,
			version,
			type,
		};

		console.log(d, branches[name]);
	}

	console.log("\nCreating mixed branches...");

	const baseBranchNames = Object.keys(branches);

	// make it easy to sort branches into this order in future
	for (let i = 0; i < baseBranchNames.length; i++) orderingMap.set(baseBranchNames[i], i);

	const allBranches = [];
	// thanks lith for this one :)
	{
		const n = baseBranchNames.length;

		for (let i = 1; i < 1 << n; i++) {
			const combination = [];

			for (let j = 0; j < n; j++) if (i & (1 << j)) combination.push(baseBranchNames[j]);

			allBranches.push(combination);
		}
	}

	for (const bNames of allBranches) {
		if (bNames.length === 1) continue; // already just fine

		const key = bNames.join("+");

		const bs = bNames.map((n) => branches[n]);

		branches[key] = {
			files: bs.map((x) => x.files).reduce((x, a) => a.concat(x), []),
			patch: bs.map((x) => x.patch).reduce((x, a) => `${x}\n{\n${a}\n}`, ""),
			preload: bs.map((x) => x.preload).reduce((x, a) => (!a ? x : `${x}\n{\n${a}\n}`), ""),
			version: parseInt(bs.map((x) => x.version).reduce((x, a) => `${x}0${a}`)),
			type: "mixed",
		};
	}

	// console.log(branches);
};

init();
