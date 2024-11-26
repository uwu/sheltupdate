const {readFileSync} = require("fs");
const {join} = require("path");
const {webFrame, ipcRenderer} = require("electron");

// run vencord's preload
require("./vencord-desktop/vencordDesktopPreload.js");

// don't lose DiscordNative
const originalPreload = ipcRenderer.sendSync("VENCORD_ORIGINAL_PRELOAD");
if (originalPreload) require(originalPreload);

// inject vencord renderer
webFrame.top.executeJavaScript(readFileSync(join(__dirname, "vencord-desktop/vencordDesktopRenderer.js"), "utf8"));
