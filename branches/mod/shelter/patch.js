const electron = require("electron");
const path = require("path");
const Module = require("module");
const fs = require("original-fs"); // using electron's fs causes app.asar to be locked during host updates
const https = require("https");
const { EOL } = require("os");

const logger = new Proxy(console, {
  get: (target, key) =>
    function (...args) {
      //logFile?.write(`[${new Date().toISOString()}] [${key}] ${args.join(" ")}${EOL}`);
      return target[key].apply(console, ["[shelter]", ...args]);
    },
});

logger.log("Loading...");

// #region Bundle
const remoteUrl =
  process.env.SHELTER_BUNDLE_URL ||
  "https://raw.githubusercontent.com/uwu/shelter-builds/main/shelter.js";
const localBundle = process.env.SHELTER_DIST_PATH;

let fetchPromise; // only fetch once

if (!localBundle)
  fetchPromise = new Promise((resolve, reject) => {
    const req = https.get(remoteUrl);

    req.on("response", (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        let data = Buffer.concat(chunks).toString("utf-8");

        if (!data.includes("//# sourceMappingURL="))
          data += `\n//# sourceMappingURL=${remoteUrl + ".map"}`;

        resolve(data);
      });
    });

    req.on("error", reject);

    req.end();
  });

const getShelterBundle = () =>
  !localBundle
    ? fetchPromise
    : Promise.resolve(
        fs.readFileSync(path.join(localBundle, "shelter.js"), "utf8") +
          `\n//# sourceMappingURL=file://${process.platform === "win32" ? "/" : ""}${path.join(
            localBundle,
            "shelter.js.map"
          )}`
      );
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
		detail: "We confirm for security reasons that this action is intended by the user. Only continue if you got here from the shelter \"Client Mods\" UI.",
	})
);
// #endregion

// #region CSP
electron.session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders }, done) => {
	const cspHeaders = Object.keys(responseHeaders).filter((name) =>
	name.toLowerCase().startsWith("content-security-policy")
	);

	for (const header of cspHeaders) {
	delete responseHeaders[header];
	}

	done({ responseHeaders });
});

electron.session.defaultSession.webRequest.onHeadersReceived = () => {};
// #endregion

// #region DevTools
// Patch DevTools setting, enabled by default
const enableDevTools = process.env.SHELTER_FORCE_DEVTOOLS?.toLowerCase() !== "false";

if (enableDevTools) {
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function (path) {
    const loadedModule = originalRequire.call(this, path);
    if (!path.endsWith("appSettings")) return loadedModule;

    const settings =
      loadedModule?.appSettings?.getSettings?.()?.settings ?? // Original
      loadedModule?.getSettings?.()?.store; // OpenAsar

    if (settings) {
      try {
        Object.defineProperty(
          settings,
          "DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING",
          {
            value: true,
            configurable: false,
            enumerable: false, // prevents our patched value from getting saved to settings.json
          }
        );
        Module.prototype.require = originalRequire;
      } catch (e) {
        logger.error(`Error patching DevTools setting: ${e}${EOL}${e.stack}`);
      }
    }
    return loadedModule;
  };
}

// #endregion
