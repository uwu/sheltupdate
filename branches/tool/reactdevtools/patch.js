const {app, session} = require("electron");
const { join } = require("path");

app.whenReady().then(async () => {
	await session.defaultSession.loadExtension(join(__dirname, "ext"));
});
