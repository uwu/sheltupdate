{
const electron = require("electron");
const path = require("path");

require("./vencord-desktop/vencordDesktopMain.js");

// preload loader, copied straight from shelter's injector

electron.ipcMain.on("VENCORD_ORIGINAL_PRELOAD", (event) => {
	event.returnValue = event.sender.originalPreload;
});

const ProxiedBrowserWindow = new Proxy(electron.BrowserWindow, {
	construct(target, args) {
		const options = args[0];
		let originalPreload;

		if (options.webPreferences?.preload && options.title) {
			originalPreload = options.webPreferences.preload;
			// We replace the preload instead of using setPreloads because of some
			// differences in internal behaviour.
			options.webPreferences.preload = path.join(__dirname, "preload.js");
		}

		const window = new target(options);
		window.webContents.originalPreload = originalPreload;
		return window;
	},
});

const electronPath = require.resolve("electron");
delete require.cache[electronPath].exports;
require.cache[electronPath].exports = {
	...electron,
	BrowserWindow: ProxiedBrowserWindow,
};
}
