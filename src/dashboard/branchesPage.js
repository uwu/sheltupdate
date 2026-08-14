import { readFileSync } from "fs";

const template = readFileSync(new URL("./branches.html", import.meta.url), "utf8");
const escape = (value) =>
	String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const formatRetry = (retryAt) => {
	const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
	if (seconds < 60) return relativeTime.format(seconds, "second");
	if (seconds < 3_600) return relativeTime.format(Math.ceil(seconds / 60), "minute");
	if (seconds < 86_400) return relativeTime.format(Math.ceil(seconds / 3_600), "hour");
	return relativeTime.format(Math.ceil(seconds / 86_400), "day");
};

export function renderBranchesPage(branches, version, marquee = "") {
	const failed = branches.filter((branch) => !branch.enabled);
	const notice = failed.length
		? `<div class="branch-status" role="alert"><span class="cluster-node cluster-offline" aria-hidden="true"></span>${failed.length} branch${failed.length === 1 ? " is" : "es are"} unavailable</div>`
		: `<div class="branch-status"><span class="cluster-node cluster-online" aria-hidden="true"></span>All branches available</div>`;

	const cards = branches
		.map((branch) => {
			const status = branch.enabled ? "online" : "offline";
			const retryAt = branch.retryAt && new Date(branch.retryAt);
			const retry = branch.enabled
				? ""
				: `<div class="branch-retry">${
						retryAt
							? `<time datetime="${retryAt.toISOString()}">Retrying ${formatRetry(retryAt)}</time>`
							: "pending"
					}</div>`;

			return `<article class="stats-card branch-card">
				<h2 class="card-title">${escape(branch.displayName)}</h2>
				<div class="branch-status"><span class="cluster-node cluster-${status}" aria-hidden="true"></span>${branch.enabled ? "Available" : "Unavailable"}</div>
				${retry}
			</article>`;
		})
		.join("");

	return template
		.replaceAll("__VERSION__", version ? ` r${escape(version)}` : "")
		.replace("__STAGING_MARQUEE__", marquee)
		.replace("__NOTICE__", notice)
		.replace("__BRANCHES__", cards);
}
