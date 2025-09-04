const { readFileSync } = require("fs");
const { join } = require("path");
const { webFrame } = require("electron");

require("./equicord-desktop/equibopPreload.js");

webFrame.top.executeJavaScript(readFileSync(join(__dirname, "equicord-desktop/renderer.js"), "utf8"));
