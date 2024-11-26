global.app.get("/updates/:channel/releases", async (req, res) => {
	// Squirrel (non-Linux)
	res.redirect(`/goosemod${req.url}`);
});

global.app.get("/updates/:channel", async (req, res) => {
	// Non-Squirrel (Linux)
	res.redirect(`/goosemod${req.url}`);
});

global.app.get("/modules/:channel/versions.json", async (req, res) => {
	res.redirect(`/goosemod${req.url}`);
});

global.app.get("/modules/:channel/:module/:version", async (req, res) => {
	res.redirect(`/goosemod${req.url}`);
});
