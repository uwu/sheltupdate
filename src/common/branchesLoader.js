import { mkdirSync, readFileSync, cpSync } from "fs";
import { join, basename } from "path";
import { pathToFileURL } from "url";
import { createHash } from "crypto";

import glob from "glob";
import { config, srcDir, version as shupVersion } from "./config.js";
import { cacheBase } from "./fsCache.js";
import { dcVersion } from "../desktopCore/index.js";
import { withSection, section } from "./tracer.js";

let branches = {};

const orderingMap = new Map(); // string => number

const setupPromises = new Map(); // string => [Promise, resolve(), boolean]

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

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

export const getSingleBranchMetas = () => {
	const sbranches = Object.entries(branches).filter(([, b]) => b.type !== "mixed" && !b.hidden);
	sbranches.sort(([a], [b]) => orderingMap.get(a) - orderingMap.get(b));

	return sbranches.map(([n, b]) => ({
		version: b.version,
		type: b.type,
		name: n,
		displayName: b.displayName,
		description: b.description,
		incompatibilities: b.incompatibilities,
		hidden: b.hidden,
	}));
};

// waits for any active setup to finish
export const ensureBranchIsReady = withSection("wait for branch ready", async (span, br) => {
	await Promise.all(
		br.split("+").map((b) => {
			const [promise, _, isSettingUp] = setupPromises.get(b);
			if (isSettingUp) span.addEvent(`Having to wait for branch ${b} to set up...`);

			return promise;
		}),
	);
});

const getBranchFilesCacheDir = (b) => join(cacheBase, `extra-files-${b}`);

const init = withSection("branch finder", async (span) => {
	const branchDir = join(srcDir, "..", "branches");

	const dirs = glob.sync(join(branchDir, "*", "*"));

	span.addEvent("found branch list", { dirs });

	await section("load branches", async (_span) => {
		for (let d of dirs) {
			const splits = d.split("/");

			const name = splits.pop();
			const type = splits.pop();

			let files = glob.sync(`${d}/*`);

			let main = "";
			let preload = "";
			let displayName = name;
			let description = "";
			let incompatibilities = []; // optional
			let hidden = false; // optional
			let setup = undefined; // optional
			for (let i = 0; i < files.length; i++) {
				const f = files[i];
				const filename = f.split("/").pop();

				if (filename === "main.js") {
					const mainSrc = readFileSync(f, "utf8").split("\n").join("\n\t\t");
					main = `// Branch: ${name}\n\ttry {\n\t\t${mainSrc}\n\t} catch(e) { console.error("[sheltupdate] Main error (${name}):", e) }\n`;
					files.splice(i--, 1);
				} else if (filename === "preload.js") {
					const preloadSrc = readFileSync(f, "utf8").split("\n").join("\n\t");
					preload = `// Branch: ${name}\ntry {\n\t${preloadSrc}\n} catch(e) { console.error("[sheltupdate] Preload error (${name}):", e) }\n`;
					files.splice(i--, 1);
				} else if (filename === "meta.js") {
					const metaMod = await import(pathToFileURL(f));
					displayName = metaMod.name;
					description = metaMod.description;
					incompatibilities = metaMod.incompatibilities ?? [];
					hidden = !!metaMod.hidden;
					setup = metaMod.setup;
					files.splice(i--, 1);
				}
			}

			// copy extra files into cache
			const cacheDir = getBranchFilesCacheDir(name);
			mkdirSync(cacheDir);

			for (let i = 0; i < files.length; i++) {
				const oldPath = files[i];
				const newPath = join(cacheDir, oldPath.slice(d.length + 1));
				files[i] = newPath;

				cpSync(oldPath, newPath, { recursive: true });
			}

			// we will reset these anyway later for branches with setups,
			// but for the rest of them, just populate it now.
			const allFiles = glob.sync(`${d}/**/*.*`);
			const fileHashes = allFiles.map((f) => sha256(readFileSync(f)));

			// the list of branches is sent along with the module and accounting for that is difficult so
			// just factor the sheltupdate release number into the version and leave it at that.
			const version = parseInt(sha256(fileHashes.join(" ") + main + preload + dcVersion + shupVersion).substring(0, 2), 16);
			const internalFiles = ["main.js", "preload.js", "meta.js"];

			branches[name] = {
				files: allFiles.filter((f) => !internalFiles.includes(basename(f))),
				cacheDirs: [cacheDir],
				main,
				preload,
				version,
				type,
				displayName,
				description,
				incompatibilities,
				hidden,
				setup,
			};

			// create wait-for-setup promises
			if (setup) {
				let resolve;
				const prom = new Promise((r) => (resolve = r));
				setupPromises.set(name, [prom, resolve, false]);
			} else {
				setupPromises.set(name, [Promise.resolve(), () => {}, false]);
			}
		}
	});

	section("fix branch ordering", (_span) => {
		const orderingJson = JSON.parse(readFileSync(join(branchDir, "ordering.json"), "utf8"));

		// validate
		const orderingJsonSet = new Set(orderingJson);
		if (orderingJson.length !== orderingJsonSet.size) throw new Error("ordering.json contains duplicates");

		for (let i = 0; i < orderingJson.length; i++) {
			const b = orderingJson[i];
			orderingMap.set(b, i);

			if (!branches[b]) throw new Error(`ordering.json references a non-existent branch ${b}`);
		}

		for (const b of Object.keys(branches))
			if (!orderingJsonSet.has(b)) {
				span.addEvent(`ordering.json does not mention branch ${b}, it will be sorted to the end`);

				orderingMap.set(b, orderingMap.size);
			}
	});

	section("create mixed branches", (_span) => {
		const baseBranchNames = Object.keys(branches);

		sortBranchesInPlace(baseBranchNames);

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
				// these will be updated by setups later so have to make it lazy
				get files() {
					return bs.map((x) => x.files).reduce((x, a) => a.concat(x), []);
				},
				get cacheDirs() {
					return bs.flatMap((b) => b.cacheDirs);
				},
				main: bs
					.map((x) => x.main)
					.filter((p) => p)
					.join("\n\t"),
				preload: bs
					.map((x) => x.preload)
					.filter((p) => p)
					.join("\n"),
				// cap the version well under u32::max or some rust code somewhere in the client dies
				// this will be updated by setups later so have to make it lazy
				get version() {
					return Number(BigInt(bs.map((x) => x.version).reduce((x, a) => `${x}0${a}`)) % BigInt(2 ** 28)) + 100;
				},
				type: "mixed",
			};
		}
	});
});

const runBranchSetups = withSection("periodic branch setups", async (span) => {
	// perfect for async code I guess

	await Promise.all(Object.keys(branches).map(singleSetup));

	async function singleSetup(b) {
		if (branches[b].type === "mixed" || !branches[b].setup) return;

		await section(`${b} setup`, async (span) => {
			const [_promise, resolve, isSettingUp, goAnyway] = setupPromises.get(b);
			if (isSettingUp && !goAnyway) {
				span.addEvent(`Skipped setting up ${b} as it was already being setup.`);
				return;
			}

			let newResolve;
			const newProm = new Promise((r) => (newResolve = r));
			setupPromises.set(b, [newProm, newResolve, true]);

			// create a folder in cache
			const cacheDir = getBranchFilesCacheDir(b);
			try {
				await branches[b].setup(cacheDir, (...a) => span.addEvent(a.join(" ")));
			} catch (e) {
				// we failed! leave it in a "setting up" state until next time.
				setupPromises.set(b, [newProm, newResolve, true, true]);
				throw e;
			}

			// regenerate files and version
			const allFiles = glob.sync(`${cacheDir}/**/*.*`);
			branches[b].cacheDirs = [cacheDir];
			branches[b].files = allFiles;

			const fileHashes = allFiles.map((f) => sha256(readFileSync(f)));
			branches[b].version = parseInt(
				sha256(fileHashes.join(" ") + branches[b].main + branches[b].preload + dcVersion).substring(0, 2),
				16,
			);

			setupPromises.set(b, [newProm, newResolve, false]);

			resolve();
			newResolve();
		});
	}
});

await init(); // lol top level await go BRRRRRRRRR

await runBranchSetups();

setInterval(runBranchSetups, config.setupIntervalHours * 60 * 60 * 1000);
