global.app.get("/guapi/branches", async (req, res) => {
	let ret = Object.keys(branches);

	if (req.query.type) ret = ret.filter((x) => x.type === req.query.type);

	res.code(200).header("Content-Type", "application/json; charset=utf-8").send(ret);
});
