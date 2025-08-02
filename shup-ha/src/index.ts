/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// make this all configurable via env somehow!
const CONFIG = {
	"localhost": [
		{ name: "🇨🇭 CH (Primary)", url: "https://ch.shelter.uwu.network", primary: true },
		{ name: "🇬🇧 GB (Fallback)", url: "https://inject.shelter.uwu.network" },
	],
	"staging.shelter.uwu.network": [
		{ name: "🇨🇭 CH (Primary)", url: "https://staging.ch.shelter.uwu.network", primary: true },
		{ name: "🇬🇧 GB (Fallback)", url: "https://staging.shelter.uwu.network" },
	],
};

// Omit here just forces TS to collapse down the union into a single object type
type Origin = Omit<typeof CONFIG[keyof typeof CONFIG][number], never>;

// key is hostname concated with origin url
type OriginStatus = { down: boolean; when: string; };

export default {
	async fetch(request, env, ctx): Promise<Response> {

		const url = new URL(request.url);

		if (!(url.hostname in CONFIG))
			return new Response(`404 Not Found. This sheltupdate HA instance is not configured to handle requests for ${url.hostname}.`, { status: 404 });

		const origins = CONFIG[url.hostname as keyof typeof CONFIG];

		const getStatus = async (originUrl: string) =>
			await env.origin_status.get(url.hostname + originUrl, "json") as OriginStatus;

		async function reportNodeDown(origin: Origin) {
			await env.origin_status.put(url.hostname + origin.url, JSON.stringify({
				down: true,
				when: new Date().toISOString()
			} satisfies OriginStatus));

			// TODO: send webhook
		}

		const addNodeHeader = (resp: Response, origin: Origin) => new Response(resp.body, {
			status: resp.status,
			headers: {
				...Object.fromEntries(resp.headers.entries()),
				"X-Shup-HA-Env": url.hostname,
				"X-Shup-HA-Node": origin.url.split("://")[1],
			},
			webSocket: resp.webSocket
		})

		// check if we're serving the dashboard
		if (url.pathname == "/") {
			let resp = 'Dashboard TODO! Statuses:';

			for (const o of origins) {
				const status = await getStatus(o.url);
				resp += `\n${o.name}: ${status ? (status.down ? "Down" : "Up") : "Unknown"}`;
			}

			return new Response(resp);
		}

		// get proxyin!
		for (const o of origins) {
			const status = await getStatus(o.url);
			if (status && status.down) continue;

			let resp;
			try {
				resp = await fetch(new URL(url.pathname, o.url).href, {
					headers: {
						...Object.fromEntries(request.headers.entries()),
						"X-Shup-HA-Env": url.hostname,
					},
					method: request.method,
				});

				if (resp.ok)
					return addNodeHeader(resp, o); // :)
			} catch {}

			// something went wrong!
			const considerNodeFailed = !resp || (500 <= resp.status && resp.status <= 599);
			if (considerNodeFailed) await reportNodeDown(o);

			// the user might just be stupid and have hit a 404 or something
			if (resp && !considerNodeFailed) return addNodeHeader(resp, o);
		}

		// none of our origins are ok!
		// TODO
		return new Response("501 Not Implemented: all nodes are down", { status: 501 })
	},

	async scheduled(controller, env, ctx) {
		// check all servers to see if they're okay
		for (const environment in CONFIG)
			for (const origin of CONFIG[environment as keyof typeof CONFIG])
				ctx.waitUntil((async () => {
					let resp;
					try {
						resp = await fetch(origin.url, { method: "HEAD" });
					} catch {}

					await env.origin_status.put(environment + origin.url, JSON.stringify({
						down: !resp || (500 <= resp.status && resp.status <= 599),
						when: new Date().toISOString()
					} satisfies OriginStatus));
				})());
	},
} satisfies ExportedHandler<Env>;
