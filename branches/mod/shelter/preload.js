const fsa = require("fs/promises");
const fss = require("fs");
const path = require("path");
const { contextBridge, ipcRenderer, webFrame } = require("electron");

// get selector UI content
const selUiJs = fss.readFileSync(path.join(__dirname, "selector-ui.js"), "utf8");

// build shelter injector plugins manifest
const injPlugins = {
	// temporarily commented out as it is NOT production ready yet
	/*"sheltupdate-branch-selector": {
		js: selUiJs,
		manifest: {
			name: "sheltupdate branch selector",
			author: "uwu.network",
			description: "responsible for the 'Client Mods' UI on sheltupdate installs"
		},
		injectorIntegration: {
			isVisible: false,
			allowedActions: {},
			loaderName: "sheltupdate"
		}
	}*/
};

// inject shelter
ipcRenderer.invoke("SHELTER_BUNDLE_FETCH").then((bundle) => {
  webFrame.executeJavaScript(
	  `const SHELTER_INJECTOR_PLUGINS = ${JSON.stringify(injPlugins)}; ${bundle}`
  );
});

// everything below this line is for the plugin selector UI exclusively

let cfgPath = __dirname;

try {
	while (true) {
		cfgPath = path.dirname(cfgPath);
		const cfgPathSettings = path.join(cfgPath, "settings.json");

		try {
			fss.statSync(cfgPathSettings);

			// settings.json exists!
			cfgPath = cfgPathSettings;
			break;
		}
		catch {}

		// if we hit a "discord" folder and still don't find it, just give up
		if (cfgPath.split("/").at(-1).toLowerCase() === "discord") {
			cfgPath = undefined;
			break;
		}
	}
}
catch {
	cfgPath = undefined;
}

if (!cfgPath) console.warn(
	"[sheltupdate] could not locate settings.json, branch selection UI will be unavailable."
);

if (cfgPath) {
	const rg1 = /^https:\/\/inject\.shelter\.uwu\.network\/([\w-+]+)$/;
	const rg2 = /^https:\/\/inject\.shelter\.uwu\.network\/([\w-+]+)\/$/;

	// TODO: have some kind of api for fetching branch metadata etc from the server
	// for now i'm just hardcoding this, but building it in such a way that its easy to replace.
	// this is intended to be temporary.

	const branches =  {
		shelter: {
			name: "shelter",
			desc: "Injects shelter",
			type: "mod"
		},
		vencord: {
			name: "Vencord",
			desc: "Injects Vencord; This is not an officially supported Vencord install method",
			type: "mod"
		},
		betterdiscord: {
			name: "BetterDiscord",
			desc: "Injects BetterDiscord",
			type: "mod"
		},

		reactdevtools: {
			name: "React Developer Tools",
			desc: "Adds the React Dev Tools to the web developer panel",
			type: "tool"
		}
	};

	async function readBranches() {
		const settings = JSON.parse(await fsa.readFile(cfgPath, "utf8"));

		if (typeof settings.UPDATE_ENDPOINT === "string") {
			const match = settings.UPDATE_ENDPOINT.match(rg1);
			if (match && match[1]) {
				return match[1].split("+")
			}
		}

		if (typeof settings.NEW_UPDATE_ENDPOINT === "string") {
			const match = settings.NEW_UPDATE_ENDPOINT.match(rg2);
			if (match && match[1]) {
				return match[1].split("+")
			}
		}

		return [];
	}

	async function setBranches(branches) {
		const settings = JSON.parse(await fsa.readFile(cfgPath, "utf8"));

		settings.UPDATE_ENDPOINT = `https://inject.shelter.uwu.network/${branches.join("+")}`;
		settings.NEW_UPDATE_ENDPOINT = `https://inject.shelter.uwu.network/${branches.join("+")}/`;

		await fsa.writeFile(cfgPath, JSON.stringify(settings));
	}

	contextBridge.exposeInMainWorld("SheltupdateNative", {
		getAllowedBranches: () => Promise.resolve(branches),
		getCurrentBranches: readBranches,

		// TODO: need an uninstall function too

		setBranches: async (br) => {
			// validate renderer-side input carefully. this code is actually security-critical
			// as if it is not sufficiently safe, privescs such as a plugin enabling BD so that it can
			// get access to require("fs") are possible.
			if (!Array.isArray(br))
				throw new Error("[sheltupdate] invalid branches passed to setBranches");

			// don't use `in` or `[]` as those are true for e.g. __proto__
			for (const branch of br)
				if (typeof branch !== "string" || !Object.keys(branches).includes(branch))
					throw new Error("[sheltupdate] invalid branches passed to setBranches");

			// get user permission first, this is our main privesc safeguard
			const dialogState = await ipcRenderer.invoke(
				"SHELTER_BRANCHCHANGE_SECURITY_DIALOG",
				br.map(b => branches[b].name).join(", ")
			);

			if (dialogState.response === 0)
				throw new Error("[sheltupdate] User declined security check for setting branches");

			// set the branches
			await setBranches(br);
		}
	});
}