const { app, session } = require("electron");
const { join } = require("path");

// apparently, manifest v3 extensions don't have their service workers started automatically?
// https://github.com/electron/electron/issues/41613#issuecomment-2644018998
function launchExtensionBackgroundWorkers(session) {
	return Promise.all(
		session.getAllExtensions().map(async (extension) => {
			const manifest = extension.manifest;
			if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
				await session.serviceWorkers.startWorkerForScope(extension.url);
				console.log("[sheltupdate-react-devtools] Manually starting background worker");
			}
		}),
	);
}

app.whenReady().then(async () => {
	await session.defaultSession.loadExtension(join(__dirname, "ext"));
	await launchExtensionBackgroundWorkers(session.defaultSession);
});
