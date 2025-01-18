const electron = require("electron");

const ProxiedBrowserWindow = new Proxy(electron.BrowserWindow, {
	construct(target, args) {
		const options = args[0];
		delete options.frame;
		const window = new target(options);

		// Account for popout windows
		const origSetWOH = window.webContents.setWindowOpenHandler;
		window.webContents.setWindowOpenHandler = function () {
			const origHandler = arguments[0];
			arguments[0] = function () {
				const details = origHandler.apply(this, arguments);

				if (details?.overrideBrowserWindowOptions) {
					delete details.overrideBrowserWindowOptions.frame;
				}
				return details;
			};
			return origSetWOH.apply(this, arguments);
		};

		return window;
	},
});

electron.app.on("browser-window-created", (_, win) => {
	// Deleting options.frame in popouts makes their menu bar visible again, so we need to hide it.
	win.setMenuBarVisibility(false);
	win.webContents.on("dom-ready", () => {
		win.webContents.insertCSS("[class *= withFrame][class *= titleBar] { display: none !important; }");
	});
});

const electronPath = require.resolve("electron");
delete require.cache[electronPath].exports;
require.cache[electronPath].exports = {
	...electron,
	BrowserWindow: ProxiedBrowserWindow,
};
