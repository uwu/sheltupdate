import { Hono } from "hono";
import { otel } from "@hono/otel";
import { createMiddleware } from "hono/factory";
import { serve } from "@hono/node-server";
import { compress } from "hono/compress";

import { config, changelog, version } from "./common/config.js";
import { getSingleBranchMetas } from "./common/branchesLoader.js";
import "./common/tracer.js";

// API handlers
import apiV1 from "./apiV1/index.js";
import apiV2 from "./apiV2/index.js";
import dashboard from "./dashboard/index.js";

// kick off webhook
import "./webhook.js";
import discovery from "./discovery.js";
import { startCloudflared, stopCloudflared } from "./common/cloudflared.js";

const app = new Hono()
	.use(compress())
	.use(otel())
	.use(
		createMiddleware(async (c, next) => {
			await next();
			c.header("Server", `sheltupdate/r${version}`);
		}),
	)
	.route("/", apiV1)
	.route("/", apiV2)
	.route("/", dashboard)
	.route("/", discovery)
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

const server = serve(
	{
		fetch: app.fetch,
		port: config.port,
	},
	() => {
		startCloudflared();
	},
);

let shuttingDown = false;

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;

	console.log(`[sheltupdate] Shutting down${signal ? ` (${signal})` : ""}`);
	let tunnelClosed = stopCloudflared(signal === "SIGINT" ? "SIGINT" : "SIGTERM");

	server.close((error) => {
		if (error || !tunnelClosed) {
			console.error("[sheltupdate] Something went wrong while shutting down, may have lingering processes!", error);
			process.exit(1);
		}

		process.exit(0);
	});
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
