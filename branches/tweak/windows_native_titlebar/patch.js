const electron = require("electron");

const ProxiedBrowserWindow = new Proxy(electron.BrowserWindow, {
	construct(target, args) {
		const options = args[0];
		delete options.frame;
		return new target(options);
	},
});

const electronPath = require.resolve("electron");
delete require.cache[electronPath].exports;
require.cache[electronPath].exports = {
	...electron,
	BrowserWindow: ProxiedBrowserWindow,
};
