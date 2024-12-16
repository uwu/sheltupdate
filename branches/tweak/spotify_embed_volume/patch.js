const fs = require("fs");
const path = require("path");
const electron = require("electron");
const script = fs.readFileSync(path.join(__dirname, "spotify-embed-volume-script.js")).toString();

electron.app.on("browser-window-created", (_, win) => {
	win.webContents.on("frame-created", (_, { frame }) => {
		frame.on("dom-ready", () => {
			if (!frame.url.startsWith("https://open.spotify.com/embed/")) return;
			frame.executeJavaScript(script);
		});
	});
});
