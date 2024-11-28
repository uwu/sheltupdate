const preloadScaffold = `
electron.ipcMain.on("SHELTUPDATE_FRAMEWORK_ORIGINAL_PRELOAD", (event) => {
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
`;

export const finalizeDesktopCoreIndex = (patches, hasPreload) =>
	`// SHELTUPDATE PATCH FRAMEWORK INDEX HEADER:
{
const electron = require("electron");
const path = require("path");
${hasPreload ? preloadScaffold : ""}
}

// END HEADER, BRANCH PATCHES:
${patches}

// END PATCHES, CHAINLOAD:
module.exports = require('./core.asar');`

export const finalizeDesktopCorePreload = (preloads) =>
	`// SHELTUPDATE PATCH FRAMEWORK PRELOAD HEADER:
{
const { ipcRenderer } = require("electron");

const originalPreload = ipcRenderer.sendSync("SHELTUPDATE_FRAMEWORK_ORIGINAL_PRELOAD");
if (originalPreload) require(originalPreload);
}

// END HEADER, BRANCH PRELOADS:
${preloads}`;