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
const stream = require("stream");
const path = require("path");

// Block Sentry requests
// We create stubs for electron.net.request to make Sentry think that the requests succeeded.
// Failed Sentry requests get added to a queue on disk. Meaning that if the user were to
// uninstall sheltupdate, all the requests would still be sent.
// see https://github.com/getsentry/sentry-electron/blob/3e4e10525b5fb24ffa98b211b91393f81e3555be/src/main/transports/electron-net.ts#L64
// and https://github.com/getsentry/sentry-electron/blob/3e4e10525b5fb24ffa98b211b91393f81e3555be/src/main/transports/offline-store.ts#L52

class RequestStub extends stream.Writable {
  _write(chunk, encoding, cb) {
    cb();
  }
  setHeader() {}
  on(type, cb) {
    if (type !== "response") return;
    cb({
      on: () => {},
      headers: {},
      statusCode: 200,
    });
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


${hasPreload ? preloadScaffold : ""}
}

// END HEADER, BRANCH PATCHES:
${patches}

// END PATCHES, CHAINLOAD:
module.exports = require('./core.asar');`;

export const finalizeDesktopCorePreload = (preloads) =>
	`// SHELTUPDATE PATCH FRAMEWORK PRELOAD HEADER:
{
const { ipcRenderer } = require("electron");

const originalPreload = ipcRenderer.sendSync("SHELTUPDATE_FRAMEWORK_ORIGINAL_PRELOAD");
if (originalPreload) require(originalPreload);
}

// END HEADER, BRANCH PRELOADS:
${preloads}`;
