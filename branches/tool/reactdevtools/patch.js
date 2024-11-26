const { session } = require("electron");
const { join } = require("path");

setImmediate(() => {
	session.defaultSession.loadExtension(join(__dirname, "ext"));
});
