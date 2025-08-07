
type Origin = {
	name: string;
	url: string;
};

type Config = Record<string, Origin[]>;

// key is hostname concated with origin url
type OriginStatus = { down: boolean; when: string };

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

export default {
	async fetch(request, env, ctx): Promise<Response> {

		const CONFIG = parseConfig(env.SHUP_CFG);

		const url = new URL(request.url);

		if (!(url.hostname in CONFIG))
			return new Response(
				`404 Not Found. This sheltupdate HA instance is not configured to handle requests for ${url.hostname}.`,
				{ status: 404 }
			);

		const origins = CONFIG[url.hostname as keyof typeof CONFIG];

		const getStatus = async (originUrl: string) =>
			(await env.origin_status.get(url.hostname + originUrl, "json")) as OriginStatus;

		async function reportNodeDown(origin: Origin) {
			await env.origin_status.put(
				url.hostname + origin.url,
				JSON.stringify({
					down: true,
					when: new Date().toISOString(),
				} satisfies OriginStatus)
			);

			// TODO: send webhook
		}

		const addNodeHeader = (resp: Response, origin: Origin) =>
			new Response(resp.body, {
				status: resp.status,
				headers: {
					...Object.fromEntries(resp.headers.entries()),
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
					status ? (status.down ? "Down" : hitFirstYet ? "Ready" : "Up") : "Unknown",
					status ? (status.down ? "#d22d39" : "#1b9e77") : "#666666",
				]);

				if (status?.down === false) hitFirstYet = true;
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
				<p class="sub" style="margin-top: .5rem">All statistics above this box are counting only for the node currently serving you ("Up")</p>
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
	src: url('http://esm.sh/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2') format('woff2');
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
			if (status && status.down) continue;

			let resp;
			try {
				resp = await fetch(new URL(url.pathname + url.search, o.url).href, {
					headers: {
						...Object.fromEntries(request.headers.entries()),
						"X-Shup-HA-Env": url.hostname,
					},
					method: request.method,
				});

				if (resp.ok) {
					// dashboard
					if (url.pathname === "/")
						return addNodeHeader(await injectDashboard(resp), o);

					if (url.pathname === "/dashboard.css")
						return addNodeHeader(await injectDashCss(resp), o);

					return addNodeHeader(resp, o); // :)
				}
			} catch {}

			// something went wrong!
			const considerNodeFailed = !resp || (500 <= resp.status && resp.status <= 599);
			if (considerNodeFailed) await reportNodeDown(o);

			// the user might just be stupid and have hit a 404 or something
			if (resp && !considerNodeFailed) return addNodeHeader(resp, o);
		}

		// none of our origins are ok!
		let proxyPath = "https://discord.com/api/";
		if (url.pathname.includes("/distributions/") || url.pathname.includes("/distro/app/")) proxyPath += "updates/";

		const res = await fetch(
			new URL(url.pathname.slice(2 + url.pathname.split("/")[1].length) + url.search, proxyPath).href,
			{
				method: request.method,
				body: request.body,
				headers: request.headers,
			}
		);
		const newHeads = new Headers(res.headers);
		newHeads.delete("Content-Encoding");
		newHeads.set("X-Shup-HA-Env", url.hostname);
		newHeads.set("X-Shup-HA-Node", "DISCORD_FALLBACK");
		return new Response(res.body, {
			status: res.status,
			headers: newHeads,
			encodeBody: "manual",
			webSocket: res.webSocket,
		});
	},

	async scheduled(controller, env, ctx) {

		const CONFIG = parseConfig(env.SHUP_CFG);

		// check all servers to see if they're okay
		for (const environment in CONFIG)
			for (const origin of CONFIG[environment as keyof typeof CONFIG])
				ctx.waitUntil(
					(async () => {
						let resp;
						try {
							resp = await fetch(origin.url, { method: "HEAD" });
						} catch {}

						await env.origin_status.put(
							environment + origin.url,
							JSON.stringify({
								down: !resp || (500 <= resp.status && resp.status <= 599),
								when: new Date().toISOString(),
							} satisfies OriginStatus)
						);
					})()
				);
	},
} satisfies ExportedHandler<Env>;
