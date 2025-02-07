const electron = require("electron");
const path = require("path");
const Module = require("module");
const fs = require("original-fs"); // "fs" module without electron modifications
const https = require("https");
const { EOL } = require("os");

const logger = new Proxy(console, {
	get: (target, key) =>
		function (...args) {
			return target[key].apply(console, ["[shelter]", ...args]);
		},
});

logger.log("Loading...");

// #region Bundle
const remoteUrl =
	process.env.SHELTER_BUNDLE_URL || "https://raw.githubusercontent.com/uwu/shelter-builds/main/shelter.js";
const distPath = process.env.SHELTER_DIST_PATH;

let localBundle;

if (distPath) {
	localBundle =
		fs.readFileSync(path.join(distPath, "shelter.js"), "utf8") +
		`\n//# sourceMappingURL=file://${process.platform === "win32" ? "/" : ""}${path.join(distPath, "shelter.js.map")}`;
}

let remoteBundle;
let remoteBundlePromise;

const fetchRemoteBundleIfNeeded = () => {
	if (localBundle || remoteBundle) return Promise.resolve();

	remoteBundlePromise ??= new Promise((resolve) => {
		const req = https.get(remoteUrl);

		req.on("response", (res) => {
			if (res.statusCode !== 200) {
				remoteBundlePromise = null;
				resolve();
				return;
			}
			const chunks = [];

			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => {
				let script = Buffer.concat(chunks).toString("utf-8");

				if (!script.includes("//# sourceMappingURL=")) script += `\n//# sourceMappingURL=${remoteUrl + ".map"}`;
				remoteBundle = script;
				remoteBundlePromise = null;
				resolve();
			});
		});

		req.on("error", (e) => {
			logger.error("Error fetching remote bundle:", e);
			remoteBundlePromise = null;
			resolve();
		});

		req.end();
	});

	return remoteBundlePromise;
};

fetchRemoteBundleIfNeeded();

const getShelterBundle = () => {
	if (localBundle) return localBundle;
	if (remoteBundle) return remoteBundle;
	return `console.error("[shelter] Bundle could not be fetched in time. Aborting!");`;
};
// #endregion

// #region IPC
electron.ipcMain.handle("SHELTER_BUNDLE_FETCH", getShelterBundle);

// used by preload
electron.ipcMain.handle("SHELTER_BRANCHCHANGE_SECURITY_DIALOG", (_, message) =>
	electron.dialog.showMessageBox({
		message,
		type: "warning",
		buttons: ["Cancel", "Confirm"],
		title: "Sheltupdate mods change",
		detail:
			'We confirm for security reasons that this action is intended by the user. Only continue if you got here from the shelter "Client Mods" UI.',
	}),
);
// #endregion

// #region CSP
electron.session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders }, done) => {
	const cspHeaders = Object.keys(responseHeaders).filter((name) =>
		name.toLowerCase().startsWith("content-security-policy"),
	);

	for (const header of cspHeaders) {
		delete responseHeaders[header];
	}

	done({ responseHeaders });
});

electron.session.defaultSession.webRequest.onHeadersReceived = () => {};
// #endregion

// #region Settings

// Patch DevTools setting, enabled by default
const enableDevTools = process.env.SHELTER_FORCE_DEVTOOLS?.toLowerCase() !== "false";

const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
	const loadedModule = originalRequire.call(this, path);
	if (!path.endsWith("appSettings")) return loadedModule;

	const settingsApi =
		loadedModule?.appSettings?.getSettings?.() ?? // stock
		loadedModule?.getSettings?.(); // openasar

	const settingsStore =
		settingsApi?.settings ?? // Original
		settingsApi?.store; // OpenAsar

	if (settingsApi) {
		const rg = /^(https?:\/\/.+)\/([a-zA-Z0-9_+-]+)\/?$/;

		const getHost = () => {
			const ue1 = settingsApi.get("UPDATE_ENDPOINT");
			const ue2 = settingsApi.get("NEW_UPDATE_ENDPOINT");

			if (typeof ue1 === "string") {
				const match = ue1.match(rg);
				if (match?.[1]) {
					return match[1];
				}
			}

			if (typeof ue2 === "string") {
				const match = ue2.match(rg);
				if (match?.[1]) {
					return match[1];
				}
			}
		};

		const host = getHost();

		electron.ipcMain.handle("SHELTER_BRANCH_GET", () => {
			const ue1 = settingsApi.get("UPDATE_ENDPOINT");
			const ue2 = settingsApi.get("NEW_UPDATE_ENDPOINT");

			if (typeof ue1 === "string") {
				const match = ue1.match(rg);
				if (match?.[2]) {
					return match[2].split("+");
				}
			}

			if (typeof ue2 === "string") {
				const match = ue2.match(rg);
				if (match?.[2]) {
					return match[2].split("+");
				}
			}

			return [];
		});

		electron.ipcMain.handle("SHELTER_BRANCH_SET", (_, b) => {
			if (b.length) {
				settingsApi.set("UPDATE_ENDPOINT", `${host}/${b.join("+")}`);
				settingsApi.set("NEW_UPDATE_ENDPOINT", `${host}/${b.join("+")}/`);
			} else {
				settingsApi.set("UPDATE_ENDPOINT", undefined);
				settingsApi.set("NEW_UPDATE_ENDPOINT", undefined);
			}
		});

		try {
			if (enableDevTools)
				Object.defineProperty(settingsStore, "DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", {
					get: () => true,
					set: () => {},
					configurable: false,
					enumerable: false, // prevents our patched value from getting saved to settings.json
				});
			Module.prototype.require = originalRequire;
		} catch (e) {
			logger.error(`Error getting settings module: ${e}${EOL}${e.stack}`);
		}
	}
	return loadedModule;
};
// #endregion

// #region Patch BrowserWindow
class BrowserWindow extends electron.BrowserWindow {
	constructor(options) {
		super(options);
		const originalLoadURL = this.loadURL;
		this.loadURL = async function (url) {
			if (url.includes("discord.com/app")) {
				await fetchRemoteBundleIfNeeded();
			}
			return await originalLoadURL.apply(this, arguments);
		};
	}
}

const electronPath = require.resolve("electron");
delete require.cache[electronPath].exports;
require.cache[electronPath].exports = {
	...electron,
	BrowserWindow,
};
// #endregion
