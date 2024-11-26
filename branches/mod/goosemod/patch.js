(async function () {
	const rgb = (r, g, b, text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;

	const log = function () {
		console.log(`[${rgb(250, 250, 0, "GooseMod")}]`, ...arguments);
	};

	const electron = require("electron");

	const otherMod = electron.BrowserWindow.toString().includes("extends") || require("util").types.isProxy(electron);

	log("Has other mod:", otherMod);

	const unstrictCSP = () => {
		log("Setting up CSP unstricter...");

		const cspAllowAll = ["connect-src", "style-src", "img-src", "font-src"];

		const corsAllowUrls = [
			"https://github.com/GooseMod/GooseMod/releases/download/dev/index.js",
			"https://github-releases.githubusercontent.com/",
		];

		electron.session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders, url }, done) => {
			let csp = responseHeaders["content-security-policy"];

			if (otherMod) {
				// Since patch v16, override other mod's onHeadersRecieved (Electron only allows 1 listener); because they rely on 0 CSP at all (GM just unrestricts some areas), remove it fully if we detect other mods
				delete responseHeaders["content-security-policy"];
				csp = null;
			}

			if (csp) {
				for (let p of cspAllowAll) {
					csp[0] = csp[0].replace(`${p}`, `${p} * blob: data:`); // * does not include data: URIs
				}

				// Fix Discord's broken CSP which disallows unsafe-inline due to having a nonce (which they don't even use?)
				csp[0] = csp[0].replace(/'nonce-.*?' /, "");
			}

			if (corsAllowUrls.some((x) => url.startsWith(x))) {
				responseHeaders["access-control-allow-origin"] = ["*"];
			}

			done({ responseHeaders });
		});
	};

	unstrictCSP();

	electron.app.once("web-contents-created", (e, webContents) => {
		webContents.once("console-message", () => {
			const { join } = require("path");
			electron.session.defaultSession.loadExtension(join(__dirname, "GMExt"));
		});
	});
})();
