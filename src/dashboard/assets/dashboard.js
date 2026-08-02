import "@unocss/reset/normalize.css";
import "./dashboard.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400-italic.css";

import * as Plot from "@observablehq/plot";
import { format, formatDurationWithOptions, intervalToDuration } from "date-fns/fp";

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
	archsWrap,
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
	"archs-wrap",
	"apiv-wrap",
].map(document.getElementById.bind(document));

/** @type {import("../discovery").UniqueUser[]} */
const users = __USERS__;
/** @type {Map<string, string>} */
const branchNames = new Map(__BRANCHES__);
const endpointHits = Object.entries(__REQUESTS__);

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

const endpointFormat = ([e]) => {
	const ns = e.split("_");
	return cap(ns.slice(1).join(" ")) + ` [${ns[0].toUpperCase()}]`;
};
endpointWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 160,
		marginRight: 85,
		label: null,
		x: {
			grid: true,
		},
		marks: [
			Plot.barX(endpointHits, { y: endpointFormat, x: "1", sort: { y: "-x" } }),
			Plot.text(endpointHits, { y: endpointFormat, x: "1", text: "1", textAnchor: "start", dx: 4 }),
		],
	}),
);

const branches = Object.values(users)
	.flatMap((u) => u.branch.split("+"))
	.map((b) => branchNames.get(b) ?? b);
branchesWrap.append(
	Plot.plot({
		marginTop: 0,
		marginLeft: 160,
		marginRight: 85,
		label: null,
		x: {
			grid: true,
		},
		marks: [
			Plot.barX(branches, Plot.groupY({ x: "count" }, { sort: { y: "-x" } })),
			Plot.text(branches, Plot.groupY({ text: "count", x: "count" }, { textAnchor: "start", dx: 4 })),
		],
	}),
);

const proportionPlot = (fill) =>
	Plot.plot({
		marginTop: 0,
		marginLeft: 35,
		marginRight: 35,
		height: 20,
		axis: false,
		color: { legend: true, scheme: "dark2" },
		marks: [proportionBar(fill)],
	});
const proportionBar = (fill) =>
	Plot.barX(users, Plot.groupZ({ x: "count" }, { fill, offset: "normalize", order: "-value", sort: { color: "x" } }));

platformsWrap.append(proportionPlot((v) => cap(v.platform)));
channelsWrap.append(proportionPlot((v) => cap(v.channel)));
archsWrap.append(proportionPlot((v) => v.arch || "unknown"));
apiVersWrap.append(proportionPlot((v) => `Version ${v.apiVer}`));
