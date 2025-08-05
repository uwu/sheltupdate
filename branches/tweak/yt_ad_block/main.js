const fs = require("fs");
const path = require("path");
const electron = require("electron");
const script = fs.readFileSync(path.join(__dirname, "yt-ad-block-script.js")).toString();

electron.app.on("browser-window-created", (_, win) => {
	win.webContents.on("frame-created", (_, { frame }) => {
		frame.on("dom-ready", () => {
			if (!frame.url.startsWith("https://www.youtube.com/embed/")) return;
			frame.executeJavaScript(script);
		});
	});
});
