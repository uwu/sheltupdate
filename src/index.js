import { Hono } from "hono";
import { logger } from "hono/logger";
import { createMiddleware } from "hono/factory";
import { serve } from "@hono/node-server";

import { config, changelog, version } from "./common/config.js";
import { getSingleBranchMetas } from "./common/branchesLoader.js";
import { resetLogger } from "./common/logger.js";

// API handlers
import apiV1 from "./apiV1/index.js";
import apiV2 from "./apiV2/index.js";
import dashboard from "./dashboard/index.js";

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
	.route("/", dashboard)
	.get("/sheltupdate_branches", async (c) => {
		// cors
		c.header("Access-Control-Allow-Origin", "*");
		return c.json(getSingleBranchMetas());
	})
	.get("/sheltupdate_changelog", async (c) => {
		// cors
		c.header("Access-Control-Allow-Origin", "*");
		return c.text(changelog);
	});

serve({
	fetch: app.fetch,
	port: config.port,
});
