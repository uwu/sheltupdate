// D1 database schema:
// CREATE TABLE incidents (timestamp REAL, env TEXT, nodesUp TEXT, allNodes TEXT, message TEXT, PRIMARY KEY (timestamp, env))
// :)
// there is no migration have fun

type Origin = {
	name: string;
	url: string;
};

type Config = Record<string, Origin[]>;

enum OriginStatusType {
	UP = 0, // down: false
	DOWN = 1, // down: true
	GRACE // secret third thing
}

// key is hostname concated with origin url
type OriginStatus = { down: OriginStatusType; when: string };

type Incident = {
	timestamp: number,
	env: string,
	nodesUp: string,
	allNodes: string,
	message: string
};

// the config is passed in via a cf secret. turn it into a useful object here
// config example:
// "inject.uwu.network; CH, https://ch.shup.net; IT, https://it.shup.net ~ staging.shup.net; CH, https://shup.net"
function parseConfig(configStr: string): Config {
	const cfg: Config = {};

	for (const env of configStr.split("~").map((e) => e.trim())) {
		// parse out env name
		const env_name = env.split(":")[0];
		const nodes_cfg = env.slice(env_name.length + 1);

		const nodes = nodes_cfg.split(";").map((node) => node.split(",").map((s) => s.trim()));

		cfg[env_name] = [];

		for (const [name, url] of nodes) cfg[env_name].push({ name, url });
	}

	return cfg;
}

function stripUnicode(unicodeStr: string) {
	// remove the flags from node names to serve
	return [...unicodeStr].filter(c => c.charCodeAt(0) <= 127).join("")
}

async function reportNodeHealth(up: boolean, env: Env, envName: string, origins: Origin[], origin: Origin) {

	let existingStatus = (await env.origin_status.get<OriginStatus>(envName + origin.url, "json"))?.down;
	// `+` here converts any stored legacy `boolean`s correctly into `OriginStatusType`s
	existingStatus = existingStatus ? +existingStatus : undefined;

	// we have a very limited number of kv put()s so we need to be frugal with them
	// put only if we have a non-up status stored, and the node is going down
	const shouldPut = !up || existingStatus !== OriginStatusType.UP;

	const newStatusType = up ? OriginStatusType.UP : {
		[OriginStatusType.UP]: OriginStatusType.GRACE,
		[OriginStatusType.GRACE]: OriginStatusType.DOWN,
		[OriginStatusType.DOWN]: OriginStatusType.DOWN,
	}[existingStatus ?? OriginStatusType.UP];

	if (shouldPut)
		await env.origin_status.put(
			envName + origin.url,
			JSON.stringify({
				down: newStatusType,
				when: new Date().toISOString(),
			} satisfies OriginStatus)
		);

	// don't log in the database the first time we encounter
	// a downtime, as often cloudflare blinks and a service goes for just one second or so
	if (newStatusType === OriginStatusType.GRACE) return;

	// check if this node status is already recorded in D1
	const lastIncident = await env.incidents_db.prepare(`
			SELECT * FROM incidents
			WHERE env = ? AND message IS NULL
			ORDER BY timestamp DESC
			LIMIT 1
		`)
		.bind(envName)
		.first<Incident>();

	if (lastIncident && lastIncident.allNodes.split(";").includes(origin.url)) {
		// if we are listed in the last status as the same status as us, then we have nothing new to report.

		const weWerePreviouslyUp = lastIncident.nodesUp.split(";").includes(origin.url);

		if (up === weWerePreviouslyUp)
			return;
	}

	// update database values
	const lastAllNodes = lastIncident?.allNodes.split(";") ?? [];
	if (lastIncident?.allNodes === "") lastAllNodes.pop(); // "" parses to [""] annoyingly

	const allNodes = origins.map(o => o.url).sort().join(";")

	// [] feels like a bad default but idfk what else to do
	const lastNodesUpSet = new Set(lastIncident?.nodesUp.split(";") ?? []);
	if (lastIncident?.nodesUp === "") lastNodesUpSet.clear(); // "" still parses to [""]

	if (lastNodesUpSet.has(origin.url) !== up) {
		if (up)
			lastNodesUpSet.add(origin.url);
		else
			lastNodesUpSet.delete(origin.url);
	}

	const newNodesUp = [...lastNodesUpSet].sort().join(";");

	// insert incident report into the database
	// message is null because that field is exclusivley for manually added outages
	// in which case, nodesUp and allNodes will be null instead
	await env.incidents_db.prepare(`
		INSERT INTO incidents (timestamp, env, nodesUp, allNodes, message)
		VALUES (unixepoch('subsec'), ?1, ?2, ?3, NULL)
	`)
		.bind(envName, newNodesUp, allNodes)
		.run();


	const msg = up
		? `sheltupdate origin node back up`
		: `sheltupdate origin node reported down`;

	const healthyNodesMsg = newNodesUp.length === allNodes.length
		? `all nodes are healthy`
		: `healthy nodes left: ${newNodesUp.length} / ${allNodes.length}`;

	await fetch(env.WEBHOOK, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			username: "sheltupdate status",
			content: `${msg}
   \\- environment: \`${envName}\`
   \\- node: ${origin.name}
   \\- ${healthyNodesMsg}`,
		})
	});
}

// used by the scheduled worker, and fired off when a request fails to double-check this outcome.
async function checkAndReportHealth(env: Env, environment: string, CONFIG: Config, origin: Origin) {
	let resp;
	try {
		resp = await fetch(origin.url, { method: "HEAD" });
	} catch {}

	const nodeIsDown = !resp || (500 <= resp.status && resp.status <= 599);

	console.log("scheduled origin check: ", environment, origin, nodeIsDown, {
		status: resp?.status,
		headers: resp && Object.fromEntries(resp.headers.entries()),
	});

	await reportNodeHealth(!nodeIsDown, env, environment, CONFIG[environment], origin);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {

		const CONFIG = parseConfig(env.SHUP_CFG);

		const url = new URL(request.url);

		// we had this actually cause a 4 min outage in staging cause someone requested //cdn.js which somehow returns 530
		// from every node and rolled us all the way down to discord api
		if (url.pathname.startsWith("//"))
			return new Response("418 I'm a Teapot. Sincerely, Fuck Off.", { status: 418 })

		if (!(url.hostname in CONFIG))
			return new Response(
				`404 Not Found. This sheltupdate HA instance is not configured to handle requests for ${url.hostname}.`,
				{ status: 404 }
			);

		const origins = CONFIG[url.hostname as keyof typeof CONFIG];

		const getStatus = async (originUrl: string) =>
			await env.origin_status.get<OriginStatus>(url.hostname + originUrl, "json");

		const addNodeHeader = (resp: Response, origin: Origin) =>
			new Response(resp.body, {
				status: resp.status,
				headers: {
					...Object.fromEntries(resp.headers.entries()),
					"Cache-Control": "no-store",
					"X-Shup-HA-Env": url.hostname,
					"X-Shup-HA-Node": stripUnicode(origin.name).trim(),
				},
				webSocket: resp.webSocket,
			});


		async function injectDashboard(origResp: Response) {
			const realHtml = await origResp.text();

			const statuses: [string, string, string][] = [];

			let hitFirstYet = false;

			for (const o of origins) {
				const status = await getStatus(o.url);
				statuses.push([
					o.name,
					status ? (status.down ? "Down" : hitFirstYet ? "Standby" : "Live") : "Unknown",
					status ? (status.down ? "#d22d39" : "#1b9e77") : "#666666",
				]);

				if (status?.down !== OriginStatusType.DOWN) hitFirstYet = true;
			}

			const toInject = `
			<div style="margin-top: 1.25rem;" class="stats-card">
				<h2 class="card-title">Nodes Status</h2>
				<div style="display: flex; flex-flow: row wrap; gap: 0.5rem 1rem; justify-content: space-evenly;width: 100%;">
					${statuses.map(([name, statusName, statusCol]) => `
						<div>
							<div style="display: inline-block; height: 0.8em; width: 0.8em; border-radius: 99999px; background: ${statusCol}"></div>
							<span>${name}: ${statusName}</span>
						</div>
					`).join("")}
				</div>
				<p class="sub" style="margin-top: .5rem">All statistics above this box are counting only for the node currently serving you ("Live")</p>
			<div>
			`;

			const newHtml = realHtml.replace("</body>", toInject + "</body>");

			return new Response(newHtml, {
				status: origResp.status,
				headers: origResp.headers,
				webSocket: origResp.webSocket,
			});
		}

		async function injectDashCss(origResp: Response) {
			const real = await origResp.text();

			// thanks microsoft, i love you too.

			const fontFaceDecl = `
@font-face {
	font-family: "Twemoji Flags";
	unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F;
	src: url('https://esm.sh/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2') format('woff2');
	font-display: swap;
}

`;

			const new_ = fontFaceDecl + real.replace("font-family:", `font-family:"Twemoji Flags",`);

			return new Response(new_, {
				status: origResp.status,
				headers: origResp.headers,
				webSocket: origResp.webSocket,
			});
		}

		// get proxyin!
		for (const o of origins) {
			const status = await getStatus(o.url);
			if (status && status.down === OriginStatusType.DOWN) continue;

			let resp;
			try {
				resp = await fetch(new URL(url.pathname + url.search, o.url).href, {
					headers: {
						...Object.fromEntries(request.headers.entries()),
						"X-Shup-HA-Env": url.hostname,
					},
					method: request.method,
					redirect: "manual",
					cache: "no-store"
				});
				let redirected = resp.status >= 300 && resp.status <= 399;

				if (redirected) {
					const location = resp.headers.get("location");
					if (!location) throw new Error("received redirect without location");

					const url = new URL(location);
					if (url.hostname !== "discord.com") {
						throw new Error(`node returned unexpected redirect, origin: ${o.name}, redirect: ${location}`);
					}
				}

				if (redirected || resp.ok) {
					// we dont want a slow D1 query in the code path for successful requests, so we dont `await` this.
					// after about 60 seconds, once KV caches invalidate, the nodes that are failed will be completely skipped,
					// so those are less of a concern for actually awaiting
					ctx.waitUntil(checkAndReportHealth(env, url.hostname, CONFIG, o));

					// dashboard
					if (url.pathname === "/") return addNodeHeader(await injectDashboard(resp), o);
					if (url.pathname === "/dashboard.css") return addNodeHeader(await injectDashCss(resp), o);

					return addNodeHeader(resp, o); // :)
				}
			} catch (e) {
				console.error("fetch error:", e);
				resp = undefined; // make sure node is marked as failed
			}

			// something went wrong!
			const considerNodeFailed = !resp || (500 <= resp.status && resp.status <= 599);

			console.log("request failed,", considerNodeFailed ? "rolling over" : "returning error", url.hostname, o.name, { status: resp?.status, headers: resp && Object.fromEntries(resp.headers.entries()) });

			if (considerNodeFailed)
				await reportNodeHealth(false, env, url.hostname, origins, o);

			// the user might just be stupid and have hit a 404 or something
			if (resp && !considerNodeFailed) return addNodeHeader(resp, o);
		}

		// none of our origins are ok!
		let proxyPath = "https://discord.com/api/";
		if (url.pathname.includes("/distributions/") || url.pathname.includes("/distro/app/")) proxyPath += "updates/";
		return Response.redirect(new URL(url.pathname.slice(2 + url.pathname.split("/")[1].length) + url.search, proxyPath).href, 307);
	},

	async scheduled(controller, env, ctx) {

		const CONFIG = parseConfig(env.SHUP_CFG);

		// check all servers to see if they're okay
		for (const environment in CONFIG)
			for (const origin of CONFIG[environment])
				await checkAndReportHealth(env, environment, CONFIG, origin);
	},
} satisfies ExportedHandler<Env>;
