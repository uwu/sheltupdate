import basicRedirect from "../../../generic/redirect.js";

global.app.get("/:branch/updates/:channel/releases", async (req, res) => {
	// Squirrel (non-Linux)
	if (!branches[req.params.branch]) {
		res.status(404);

		res.send("Invalid GooseUpdate branch");
		return;
	}

	requestCounts.host_squirrel++;

	console.log({ type: "host_squirrel", id: req.query.id, localVersion: req.query.localVersion, arch: req.query.arch });

	/*let prox = (await basicProxy(req, res)).data;
    
  console.log(prox);
    
  res.send(prox);*/

	basicRedirect(req, res);

	//res.send(typeof prox === 'string' ? prox : JSON.stringify(json));
});
