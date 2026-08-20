import { readFileSync } from "fs";

const template = readFileSync(new URL("./branches.html", import.meta.url), "utf8");
const escape = (value) =>
	String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const formatRetry = (retryAt) => {
	const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
	if (seconds < 60) {
		const value = seconds;
		return relativeTime.format(value, value === 1 ? "second" : "seconds");
	}
	if (seconds < 3_600) {
		const value = Math.ceil(seconds / 60);
		return relativeTime.format(value, value === 1 ? "minute" : "minutes");
	}
	if (seconds < 86_400) {
		const value = Math.ceil(seconds / 3_600);
		return relativeTime.format(value, value === 1 ? "hour" : "hours");
	}
	const value = Math.ceil(seconds / 86_400);
	return relativeTime.format(value, value === 1 ? "day" : "days");
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

function branchStatusTemplate(branches) {
	return `
	<div id="branch-statuses" class="stats-card">
		<h2 class="card-title">Branches</h2>
		<div>
			${branches.filter(branch => !branch.hidden).map(
				(branch) => `
				<div>
					<div class="branch-status branch-${branch.enabled ? "online" : "offline"}"></div>
					<span>${branch.displayName}: ${branch.enabled ? "available" : `temporarily unavailable; retrying in ${formatRetry(branch.retryAt)}`}</span>
					<p class="sub muted">${capitalize(branch.type)}: ${branch.description}</p>
				</div>`,)
			.join("\n")}
		</div>
	</div>`;
}

export function renderBranchesPage(branches, version, marquee = "") {
	return template
		.replaceAll("__VERSION__", version ? ` r${escape(version)}` : "")
		.replace("__STAGING_MARQUEE__", marquee)
		.replace("__BRANCHES__", branchStatusTemplate(branches));
}
