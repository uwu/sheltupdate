import {Hono} from "hono";
import {logger} from "hono/logger";
import {createMiddleware} from "hono/factory";
import {serve} from "@hono/node-server";

import {config, version} from "./config.js";
import {branches} from "./branchesLoader.js";

// hono sub-routers
//import apiV1 from "./apiV1";
import apiV2 from "./apiV2/index.js";

// kick off webhook
import "./webhook.js";

const app = new Hono()
	.use(logger())
	.use(createMiddleware(async (c, next) => {
		await next();
		c.header("Server", `sheltupdate/r${version}`);
	}))
	.use(createMiddleware(async (c, next) => {
		await next();
		if (c.req.url.includes(".zip"))
			c.header("Content-Type", "application/zip");
	}))
	//.route("/", apiV1)
	.route("/", apiV2)
	.get("/guapi/branches", async (c) => {
		let ret = Object.keys(branches);

		const type = c.req.query("type");
		if (type) ret = ret.filter((x) => x.type === type);

		return c.json(ret);
	});

serve({
	fetch: app.fetch,
	port: config.port
});