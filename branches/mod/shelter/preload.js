const fss = require("fs");
const path = require("path");
const { contextBridge, ipcRenderer, webFrame } = require("electron");

// get selector UI content
const selUiJs = fss.readFileSync(path.join(__dirname, "selector-ui.js"), "utf8");

// build shelter injector plugins manifest
const injPlugins = {
	"sheltupdate-branch-selector": {
		js: selUiJs,
		manifest: {
			name: "sheltupdate branch selector",
			author: "uwu.network",
			description: "responsible for the 'Client Mods' UI on sheltupdate installs",
		},
		injectorIntegration: {
			isVisible: false,
			allowedActions: {},
			loaderName: "sheltupdate",
		},
	},
};

// inject shelter
ipcRenderer.invoke("SHELTER_BUNDLE_FETCH").then((bundle) => {
	webFrame.executeJavaScript(`const SHELTER_INJECTOR_PLUGINS = ${JSON.stringify(injPlugins)}; ${bundle}`);
});

// everything below this comment is for the plugin selector UI exclusively

// TODO: have some kind of api for fetching branch metadata etc from the server
// for now i'm just hardcoding this, but building it in such a way that its easy to replace.
// this is intended to be temporary.

const branches = {
	shelter: {
		name: "shelter",
		desc: "Injects shelter",
		type: "mod",
	},
	vencord: {
		name: "Vencord",
		desc: "Injects Vencord; This is not an officially supported Vencord install method",
		type: "mod",
	},
	betterdiscord: {
		name: "BetterDiscord",
		desc: "Injects BetterDiscord",
		type: "mod",
	},

	reactdevtools: {
		name: "React Developer Tools",
		desc: "Adds the React Dev Tools to the web developer panel",
		type: "tool",
	},
};

const readBranches = () => ipcRenderer.invoke("SHELTER_BRANCH_GET");

const setBranches = (branches) => ipcRenderer.invoke("SHELTER_BRANCH_SET", branches);

contextBridge.exposeInMainWorld("SheltupdateNative", {
	getAllowedBranches: () => Promise.resolve(branches),
	getCurrentBranches: readBranches,

	setBranches: async (br) => {
		// validate renderer-side input carefully. this code is actually security-critical
		// as if it is not sufficiently safe, privescs such as a plugin enabling BD so that it can
		// get access to require("fs") are possible.
		if (!Array.isArray(br) && br.length > 0) throw new Error("[sheltupdate] invalid branches passed to setBranches");

		// don't use `in` or `[]` as those are true for e.g. __proto__
		for (const branch of br)
			if (typeof branch !== "string" || !Object.keys(branches).includes(branch))
				throw new Error("[sheltupdate] invalid branches passed to setBranches");

		// get user permission first, this is our main privesc safeguard
		const dialogState = await ipcRenderer.invoke(
			"SHELTER_BRANCHCHANGE_SECURITY_DIALOG",
			`Confirm you want to change your installed mods to: ${br.map((b) => branches[b].name).join(", ")}?`,
		);

		if (dialogState.response === 0)
			throw new Error("[sheltupdate] User declined security check for setting branches");

		// set the branches
		await setBranches(br);
	},

	// this is a goofy function to have to write
	uninstall: async () => {
		// once again get user permission
		const res = await ipcRenderer.invoke(
			"SHELTER_BRANCHCHANGE_SECURITY_DIALOG",
			`Confirm you want to uninstall your client mods? Your settings will not be deleted.`,
		);
		if (res.response === 0) throw new Error("[sheltupdate] User declined security check");

		await setBranches([]);
	},
});
