import { config } from "./common/config.js";
import { uniqueUsers } from "./common/state.js";

if (config.webhook.enable) {
	const url = config.webhook.url;

	const responseBase = {
		content: "",
		username: config.webhook.username,
		avatar_url: config.webhook.avatar_url,
	};

	const send = async (content, embeds = undefined) => {
		if (!url) return;

		const json = Object.assign(responseBase, { content, embeds });

		try {
			await fetch(url, { body: JSON.stringify(json), method: "POST" });
		} catch (e) {
			console.log(e.response);
		}
	};

	const sendStats = async () => {
		await send("", [
			{
				title: "Stats",
				fields: [
					{
						name: "Users",
						value: Object.values(uniqueUsers).length,
						inline: true,
					},
				],
			},
		]);
	};

	send("", [
		{
			title: "Started Up",
		},
	]);

	setTimeout(sendStats, 60 * 1000);
	setInterval(sendStats, 60 * 60 * 1000);
}
