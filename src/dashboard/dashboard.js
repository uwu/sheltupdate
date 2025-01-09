// for some reason esm.sh needs bundle-deps for this. probably helps bundle size anyway.
// full bundle: 391.25kB, partial bundle: 246.31kB. its something!
import * as Plot from "@observablehq/plot?bundle-deps&exports=plot,barX,text,gridX";
// full bundle: 82.36kB, partial bundle: 23.15kB
import {
	format,
	formatDurationWithOptions,
	intervalToDuration,
} from "date-fns/fp?exports=format,formatDurationWithOptions,intervalToDuration";

const since = (t) => intervalToDuration({ start: t, end: new Date() });

const cap = (s) =>
	s
		.split(" ")
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(" ");

const formatTime = format("h:mm:ss b");
const formatDurDHM = formatDurationWithOptions({ format: ["days", "hours", "minutes"] });
const formatDurAuto = formatDurationWithOptions({});

const formatSince = (s) => formatDurDHM(since(s)) || formatDurAuto(since(s));

const [
	uptimeEl,
	startTimeEl,
	lastModEl,
	endpointWrap,
	branchesWrap,
	channelsWrap,
	platformsWrap,
	hostVersWrap,
	apiVersWrap,
] = [
	"stat-uptime",
	"stat-start-time",
	"stat-last-mod",
	"endpoint-plot-wrap",
	"branches-wrap",
	"chans-wrap",
	"plats-wrap",
	"hosts-wrap",
	"apiv-wrap",
].map(document.getElementById.bind(document));

const statsState = { STATE }; /*{
	uniqueUsers: {
		a: {
			platform: "linux",
			host_version: "0.0.78",
			channel: "stable",
			branch: "shelter+reactdevtools+vencord",
			apiVer: 1,
			time: new Date("2024-12-20 9:00:00"),
		},
		b: {
			platform: "win",
			host_version: "unknown",
			channel: "canary",
			branch: "shelter+vencord",
			apiVer: 2,
			time: new Date("2024-12-20 16:00:00"),
		},
		c: {
			platform: "win",
			host_version: "unknown",
			channel: "canary",
			branch: "shelter+vencord",
			apiVer: 2,
			time: new Date("2024-12-20 16:00:00"),
		},
		d: {
			platform: "mac",
			host_version: "unknown",
			channel: "stable",
			branch: "vencord",
			apiVer: 2,
			time: new Date("2024-12-20 13:00:00"),
		},
	},
	requestCounts: {
		v1_host_squirrel: 435,
		v1_host_notsquirrel: 34,
		v1_modules: 45,
		v1_module_download: 345,
		v2_manifest: 45,
		v2_module: 56,
		v2_custom_module: 3,
	},
	proxyOrRedirect: {
		proxied: 89,
		redirected: 2,
	},
	proxyCacheHitRatio: {
		hit: 90,
		miss: 34,
	},
	v1ModuleCacheHitRatio: {
		hit: 90,
		miss: 2,
	},
	v2ManifestCacheHitRatio: {
		hit: 90,
		miss: 31,
	},
};*/

const branchMetadata = { BRANCHES }; /*[
	{
		version: 110,
		type: "mod",
		name: "shelter",
		displayName: "shelter",
		description: "Injects shelter",
		hidden: false,
	},
	{
		version: 16,
		type: "mod",
		name: "vencord",
		displayName: "Vencord",
		description: "Injects Vencord; This is not an officially supported Vencord install method",
		hidden: false,
	},
	{
		version: 223,
		type: "mod",
		name: "betterdiscord",
		displayName: "BetterDiscord",
		description: "Injects BetterDiscord",
		hidden: false,
	},
	{
		version: 231,
		type: "tool",
		name: "reactdevtools",
		displayName: "React Developer Tools",
		description: "Adds the React Dev Tools to the web developer panel",
		hidden: false,
	},
	{
		version: 13,
		type: "tweak",
		name: "spotify_embed_volume",
		displayName: "Spotify Embed Volume",
		description: "Adds a volume slider to Spotify embeds",
		hidden: false,
	},
	{
		version: 125,
		type: "tweak",
		name: "yt_ad_block",
		displayName: "YouTube Ad Block",
		description: "Removes ads in embeds and in the Watch Together activity",
		hidden: false,
	},
	{
		version: 122,
		type: "tweak",
		name: "yt_embed_fix",
		displayName: "YouTube Embed Fix",
		description: "Enables more videos to be viewable from within Discord (like UMG blocked ones)",
		hidden: false,
	},
];*/

const startTime = new Date({ START_TIME } /*1734667290000*/);
startTimeEl.textContent = formatTime(startTime);

const refreshTimes = () => {
	uptimeEl.textContent = formatSince(startTime);
};
refreshTimes();
setInterval(refreshTimes, 1_000);

const endpointsEntries = Object.entries(statsState.requestCounts).map(([name, hits]) => {
	const ns = name.split("_");

	return { hits, endpoint: cap(ns.slice(1).join(" ")) + ` [${ns[0].toUpperCase()}]` };
});

const branchCounts = {};
const platformCounts = {};
const hostVerCounts = {};
const apiVerCounts = {};
const channelCounts = {};
for (const user of Object.values(statsState.uniqueUsers)) {
	const host = user.host_version === "unknown" ? "Unknown Host" : "Host " + user.host_version;

	for (const br of user.branch.split("+")) {
		const brPretty = branchMetadata.find((b) => b.name === br)?.displayName ?? br;

		branchCounts[brPretty] ??= 0;
		branchCounts[brPretty]++;
	}
	platformCounts[cap(user.platform)] ??= 0;
	platformCounts[cap(user.platform)]++;
	hostVerCounts[host] ??= 0;
	hostVerCounts[host]++;
	apiVerCounts["API V" + user.apiVer] ??= 0;
	apiVerCounts["API V" + user.apiVer]++;
	channelCounts[cap(user.channel)] ??= 0;
	channelCounts[cap(user.channel)]++;
}

endpointWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 160,
		marginRight: 35,
		label: null,
		marks: [
			Plot.barX(endpointsEntries, { y: "endpoint", x: "hits", sort: { y: "-x" } }),
			Plot.text(endpointsEntries, { y: "endpoint", x: "hits", text: "hits", textAnchor: "start", dx: 4 }),
			Plot.gridX(),
		],
	}),
);

branchesWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 160,
		marginRight: 35,
		label: null,
		marks: [
			Plot.barX(Object.entries(branchCounts), { y: "0", x: "1", sort: { y: "-x" } }),
			Plot.text(Object.entries(branchCounts), { y: "0", x: "1", text: "1", textAnchor: "start", dx: 4 }),
			Plot.gridX(),
		],
	}),
);

platformsWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2" },
		marks: [Plot.barX(Object.entries(platformCounts), { x: "1", fill: "0" }), Plot.gridX()],
	}),
);

channelsWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2" },
		marks: [Plot.barX(Object.entries(channelCounts), { x: "1", fill: "0" }), Plot.gridX()],
	}),
);

hostVersWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2" },
		marks: [Plot.barX(Object.entries(hostVerCounts), { x: "1", fill: "0" }), Plot.gridX()],
	}),
);

apiVersWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2" },
		marks: [Plot.barX(Object.entries(apiVerCounts), { x: "1", fill: "0" }), Plot.gridX()],
	}),
);
