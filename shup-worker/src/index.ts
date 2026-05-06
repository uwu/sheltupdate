export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (Object.keys(env.VPC_MAP).includes(url.hostname)) {
			const vpcName = env.VPC_MAP[url.hostname as keyof typeof env.VPC_MAP];
			const vpc = env[vpcName];

			if (vpc) {
				try {
					return await vpc.fetch(`http://sheltupdate.invalid${url.pathname}${url.search}`, {
						method: request.method,
						headers: request.headers,
						body: request.body,
						redirect: "manual",
						cache: "no-store",
					});
				} catch (e) {
					// Technically no need to log anything, this should show up in the VPC metrics.
					console.error(e);
					let base: string = env.BASE_V1;
					if (url.pathname.includes("/distributions/") || url.pathname.includes("/distro/app/")) {
						base = env.BASE_V2;
					}
					return Response.redirect(
						new URL(url.pathname.slice(2 + url.pathname.split("/")[1].length) + url.search, base).href,
						307,
					);
				}
			}
		}

		return new Response(`no upstream configured for ${url.hostname}`, { status: 502 });
	},
} satisfies ExportedHandler<Env>;
