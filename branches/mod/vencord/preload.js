const {readFileSync} = require("fs");
const {join} = require("path");
const {webFrame} = require("electron");

// run vencord's preload
require("./vencord-desktop/vencordDesktopPreload.js");

// inject vencord renderer
webFrame.top.executeJavaScript(readFileSync(join(__dirname, "vencord-desktop/renderer.js"), "utf8"));
