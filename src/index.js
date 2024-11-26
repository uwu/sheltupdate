import fastify from "fastify";

// import express from 'express';
// import http from 'http';
// import spdy from 'spdy';

import { readFileSync, createReadStream } from "fs";

import { dirname } from "path";
import { fileURLToPath } from "url";

global.srcDir = dirname(fileURLToPath(import.meta.url));

import config from "../config.js";
global.config = config;

console.log(config);

const fastifyOptions = {
	caseSensitive: false,
};

if (config.webserver?.https)
	fastifyOptions.https = {
		key: readFileSync(config.webserver.https.key),
		cert: readFileSync(config.webserver.https.cert),
	};

if (config.experimental?.webserver?.http2?.enabled && config.webserver?.https) fastifyOptions.http2 = true;
if (config.experimental?.webserver?.http2?.allowFallback && config.webserver?.https)
	fastifyOptions.https.allowHTTP1 = true;

const app = fastify(fastifyOptions);

//const app = express();
global.app = app;

global.startTime = Date.now();
global.version = "7.0.0";

const port = process.argv[2] || 80;
if (!process.argv[2]) console.log(`No port specified in args, using default: ${port}\n`);

global.app.addHook("preHandler", (req, res, done) => {
	console.log("[req]", req.url);
	res.header("Server", `GooseUpdate v${version}`);

	done();
});

global.app.decorateReply("sendFile", function (filename) {
	// Adding Express feature
	const stream = createReadStream(filename);

	let contentType = "";

	switch (filename.split(".").pop()) {
		case "zip":
			contentType = "application/zip";
			break;

		default:
			contentType = "text/plain";
			break;
	}

	this.type(contentType).send(stream);
});

import("./webhook.js");

(async function () {
	console.log("Loading API v1...");
	await import("./apiV1/index.js");

	if (config.experimental?.apiV2Enabled) {
		console.log("Loading API v2...");
		await import("./apiV2/index.js");
	}

	if (config.guApi?.enabled || true) {
		console.log("Loading GU API...");
		await import("./guAPI/index.js");
	}

	app.listen(port, "0.0.0.0");

	/*const options = !config.webserver?.https ? {} : {
    key: readFileSync(config.webserver.https.key),
    cert: readFileSync(config.webserver.https.cert)
  };

  (config.experimental?.webserver?.http2 ? spdy : http).createServer(options, app)
    .listen(port, (err) => {
      console.log('done', err);
    });*/
})();
