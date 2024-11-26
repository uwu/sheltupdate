import axios from "axios";

global.app.get("/guapi/goosemod/dev", async (req, res) => {
	const prox = await axios.get(`https://github.com/GooseMod/GooseMod/releases/download/dev/index.js`, {});

	res.header("Access-Control-Allow-Origin", "*");

	res.send(prox.data);
});
