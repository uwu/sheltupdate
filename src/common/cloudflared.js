import { spawn } from "child_process";
import { config } from "./config.js";

let child;
let shuttingDown = false;

export function startCloudflared() {
	const { enabled, binary } = config.cloudflared;

	if (!enabled || child) return child;

	console.log(`[cloudflared] Starting tunnel for ${config.host}`);

	child = spawn(binary, ["tunnel", "--loglevel", "error", "run"]);

	child.stderr.on("data", (data) => {
		console.log(`[cloudflared] ${data}`);
	});

	child.on("error", (error) => {
		console.error("[cloudflared] Failed to start tunnel process:", error);
	});

	child.on("exit", (code, signal) => {
		const expected = shuttingDown;
		child = undefined;
		shuttingDown = false;

		if (expected) {
			console.log("[cloudflared] Tunnel stopped");
		} else {
			console.error(`[cloudflared] Tunnel exited unexpectedly (code=${code}, signal=${signal})`);
		}
	});

	return child;
}

export function stopCloudflared(signal = "SIGTERM") {
	if (!child) return true;

	shuttingDown = true;

	if (child.kill(signal)) {
		console.log(`[cloudflared] Stopping tunnel (signal=${signal})...`);
	} else {
		console.error(`[cloudflared] Failed to stop tunnel (signal=${signal})`);
		shuttingDown = false;
	}

	return shuttingDown;
}
