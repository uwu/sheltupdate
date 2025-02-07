const { readdirSync, statSync } = require("original-fs");
const { join, basename } = require("path");

// Discord always launches the desktop_core module with the highest version.
// This means that if the module gets downgraded (by us), Discord won't load the
// correct one. Here we account for that.
let proxyExports;
// Test for a specific modules directory structure with which the issue occurs.
const parentDirName = basename(join(__dirname, ".."));
if (parentDirName.startsWith("discord_desktop_core-")) {
	const latestModule = getLatestDesktopCoreModule();
	const currentModule = __dirname;
	if (currentModule !== latestModule) {
		proxyExports = require(join(latestModule, "index.js"));
	}
}

if (proxyExports === undefined) {
	try {
		run();
	} catch (e) {
		console.error("[sheltupdate] Error during setup", e);
	}
	proxyExports = require("./core.asar");
}

module.exports = proxyExports;

function getLatestDesktopCoreModule() {
	const modulesDir = join(__dirname, "..", "..");
	const dirs = readdirSync(modulesDir).filter((d) => d.startsWith("discord_desktop_core"));

	let latestVal = 0;
	let latestDir;
	for (const d of dirs) {
		const { birthtimeMs } = statSync(join(modulesDir, d));
		if (birthtimeMs > latestVal) {
			latestDir = d;
			latestVal = birthtimeMs;
		}
	}
	return join(modulesDir, latestDir, "discord_desktop_core");
}

function run() {
	const electron = require("electron");
	const stream = require("stream");

	// Block Sentry requests
	// We create stubs for electron.net.request to make Sentry think that the requests succeeded.
	// Because making them error leads to Sentry adding them to a queue on disk. Meaning that if
	// the user were to uninstall sheltupdate, all the requests would still be sent subsequently.
	// see https://github.com/getsentry/sentry-electron/blob/3e4e10525b5fb24ffa98b211b91393f81e3555be/src/main/transports/electron-net.ts#L64
	// and https://github.com/getsentry/sentry-electron/blob/3e4e10525b5fb24ffa98b211b91393f81e3555be/src/main/transports/offline-store.ts#L52

	class RequestStub extends stream.Writable {
		_write(chunk, encoding, cb) {
			cb();
		}
		setHeader() {}
		on(type, cb) {
			if (type !== "response") return;
			cb({ on: () => {}, headers: {}, statusCode: 200 });
		}
	}

	const origRequest = electron.net.request;
	electron.net.request = function (options) {
		if (!options?.hostname?.endsWith("sentry.io")) {
			return origRequest.apply(this, arguments);
		}
		console.log("[sheltupdate] Blocking Sentry request!");
		return new RequestStub();
	};

	electron.ipcMain.on("SHELTUPDATE_FRAMEWORK_ORIGINAL_PRELOAD", (event) => {
		event.returnValue = event.sender.sheltupdateOriginalPreload;
	});

	class BrowserWindow extends electron.BrowserWindow {
		constructor(options) {
			let originalPreload;

			if (options.webPreferences?.preload && options.title) {
				originalPreload = options.webPreferences.preload;
				// We replace the preload instead of using setPreloads because of some
				// differences in internal behaviour.
				options.webPreferences.preload = join(__dirname, "preload.js");
			}

			super(options);
			this.webContents.sheltupdateOriginalPreload = originalPreload;
		}
	}

	const electronPath = require.resolve("electron");
	delete require.cache[electronPath].exports;
	require.cache[electronPath].exports = {
		...electron,
		BrowserWindow,
	};

	// __BRANCHES_MAIN__
}
