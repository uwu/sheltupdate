import { Hono } from "hono";
import { logger } from "hono/logger";
import { createMiddleware } from "hono/factory";
import { serve } from "@hono/node-server";

import { config, version } from "./common/config.js";
//import { branches } from "./common/branchesLoader.js";
import {resetLogger} from "./common/logger.js";

// API handlers
import apiV1 from "./apiV1/index.js";
import apiV2 from "./apiV2/index.js";
import { handleDashboard } from "./dashboard/index.js";

// kick off webhook
import "./webhook.js";

const app = new Hono()
	.use(logger())
	.use(
		createMiddleware(async (c, next) => {
			await next();
			c.header("Server", `sheltupdate/r${version}`);
			resetLogger();
		}),
	)
	.route("/", apiV1)
	.route("/", apiV2)
	.get("/", handleDashboard);
/*.get("/guapi/branches", async (c) => {
		let ret = Object.keys(branches);

		const type = c.req.query("type");
		if (type) ret = ret.filter((x) => x.type === type);

		return c.json(ret);
	})*/

serve({
	fetch: app.fetch,
	port: config.port,
});
