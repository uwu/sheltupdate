import config from "../config.js";

const url = config.webhook ? config.webhook.url : undefined;

const responseBase = {
	content: "",
	username: config.webhook ? config.webhook.username : undefined,
	avatar_url: config.webhook ? config.webhook.avatar_url : undefined,
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
					value: Object.values(global.uniqueUsers).length,
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
