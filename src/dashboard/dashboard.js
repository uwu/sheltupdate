// for some reason esm.sh needs bundle-deps for this. probably helps bundle size anyway.
// full bundle: 391.25kB, partial bundle: 246.31kB. its something!
import * as Plot from "@observablehq/plot?bundle-deps&exports=plot,barX,text,gridX";
// full bundle: 82.36kB, partial bundle: 23.15kB
import {
	format,
	formatDurationWithOptions,
	intervalToDuration,
} from "date-fns/fp?bundle-deps&exports=format,formatDurationWithOptions,intervalToDuration";

const since = (t) => intervalToDuration({ start: t, end: new Date() });

const cap = (s) =>
	s
		.split(" ")
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(" ");

const formatTime = format("h:mm:ss b");
const formatDateTime = format("MMM d, h:mm:ss b");
const formatDateTimeWithYear = format("MMM d, yyyy, h:mm:ss b");
const formatDurDHM = formatDurationWithOptions({ format: ["days", "hours", "minutes"] });
const formatDurAuto = formatDurationWithOptions({});

const formatSince = (s) => formatDurDHM(since(s)) || formatDurAuto(since(s));

const formatStartTime = (start) => {
	const now = new Date();

	if (start.getFullYear() !== now.getFullYear()) return formatDateTimeWithYear(start);
	if (since(start).days) return formatDateTime(start);

	return formatTime(start);
};

const [
	nodeUptimeEl,
	nodeStartTimeEl,
	clusterUptimeEl,
	clusterStartTimeEl,
	endpointWrap,
	branchesWrap,
	channelsWrap,
	platformsWrap,
	hostVersWrap,
	apiVersWrap,
] = [
	"stat-node-uptime",
	"stat-node-start-time",
	"stat-cluster-uptime",
	"stat-cluster-start-time",
	"endpoint-plot-wrap",
	"branches-wrap",
	"chans-wrap",
	"plats-wrap",
	"hosts-wrap",
	"apiv-wrap",
].map(document.getElementById.bind(document));

/** @type {import("../discovery").Statistics} */
const statsState = __STATE__;

/**
 * @typedef Branch
 * @prop {number} version
 * @prop {string} type
 * @prop {string} name
 * @prop {string} displayName
 * @prop {string} description
 * @prop {boolean} hidden
 */
/** @type {Branch[]} */
const branchMetadata = __BRANCHES__;

const nodeStartTime = new Date(__NODE_START_TIME__ /*1734667290000*/);
const clusterStartTime = new Date(__CLUSTER_START_TIME__ /*1734667290000*/);
nodeStartTimeEl.textContent = formatStartTime(nodeStartTime);
clusterStartTimeEl.textContent = formatStartTime(clusterStartTime);

const refreshTimes = () => {
	nodeUptimeEl.textContent = formatSince(nodeStartTime);
	clusterUptimeEl.textContent = formatSince(clusterStartTime);
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
	const host = `${user.platform} ${user.version || "unknown"}`;
	const channel = cap(user.channel);
	const platform = cap(user.platform);

	for (const br of user.branch.split("+")) {
		const brPretty = branchMetadata.find((b) => b.name === br)?.displayName ?? br;

		branchCounts[brPretty] ??= 0;
		branchCounts[brPretty]++;
	}
	platformCounts[platform] ??= 0;
	platformCounts[platform]++;
	hostVerCounts[host] ??= 0;
	hostVerCounts[host]++;
	apiVerCounts["API V" + user.apiVer] ??= 0;
	apiVerCounts["API V" + user.apiVer]++;
	channelCounts[channel] ??= 0;
	channelCounts[channel]++;
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

const byValue = ([, valueA], [, valueB]) => (valueA > valueB ? -1 : valueA < valueB ? 1 : 0);

const sortedPlatformCounts = Object.entries(platformCounts).sort(byValue);
platformsWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2", domain: sortedPlatformCounts.map(([k]) => k) },
		marks: [Plot.barX(sortedPlatformCounts, { x: "1", fill: "0" })],
	}),
);

const sortedChannelCounts = Object.entries(channelCounts).sort(byValue);
channelsWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2", domain: sortedChannelCounts.map(([k]) => k) },
		marks: [Plot.barX(sortedChannelCounts, { x: "1", fill: "0" })],
	}),
);

const sortedHostVerCounts = Object.entries(hostVerCounts).sort(byValue);
hostVersWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2", domain: sortedHostVerCounts.map(([k]) => k) },
		marks: [Plot.barX(sortedHostVerCounts, { x: "1", fill: "0" })],
	}),
);

const sortedApiVerCounts = Object.entries(apiVerCounts).sort(byValue);
apiVersWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		label: null,
		axis: false,
		color: { legend: true, scheme: "dark2", domain: sortedApiVerCounts.map(([k]) => k) },
		marks: [Plot.barX(sortedApiVerCounts, { x: "1", fill: "0" })],
	}),
);
