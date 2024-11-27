import { readFileSync } from "fs";
import { join } from "path";
import {proxyCacheHitArr, proxyVsRedirect, requestCounts, uniqueUsers} from "../state.js";
import {srcDir, startTime, version} from "../config.js";

// Hell.
const indexTemplate = readFileSync(join(srcDir, "dashboard", "template.html"), "utf8");

const generatePie = (arr) => {
	const colors = ["#D9434B", "#D9D659", "#2E9BD9", "#8C1D23", "#24678C"];
	const unique = arr.filter((v, i, s) => s.indexOf(v) === i).sort((a, b) => a.localeCompare(b));

	let offset = 0;
	const segments = unique.map((u, i) => {
		const count = arr.filter((x) => x === u).length;

		const percent = parseFloat(((count / arr.length) * 100).toFixed(1));

		const ret = [
			`<div class="pie__segment" style="--offset: ${offset}; --value: ${percent}; --over50: ${percent > 50 ? 1 : 0}; --bg: ${colors[i % colors.length]};"></div>`,
			`<div style="--bg: ${colors[i % colors.length]};">${u[0].toUpperCase() + u.substring(1)}: ${percent}%</div>`,
		];

		offset += percent;

		return ret;
	});

	const pieSegments = segments.map((x) => x[0]);
	const legendSegments = segments.map((x) => x[1]);

	return `
  <div class="pie">
  ${pieSegments.join("\n")}
  </div>
  <div class="pie-legend">
  ${legendSegments.join("\n")}
  </div>`;
};

const getDiffTime = (orig) => {
	const diff = Date.now() - orig;

	const minTotal = diff / 1000 / 60;

	const hour = Math.floor(minTotal / 60);
	const minOver = Math.floor(minTotal % 60);
	const secOver = Math.floor((minTotal * 60) % 60);

	return `${hour.toString().padStart(2, "0")}:${minOver.toString().padStart(2, "0")}:${secOver.toString().padStart(2, "0")}`;
};

export const handleDashboard = (c) => {
	const usersValues = Object.values(uniqueUsers);

	let temp = indexTemplate.slice(); // fs.readFileSync('index.html', 'utf8'); //  //
	temp = temp.replace("TEMPLATE_TOTAL_USERS", usersValues.length);
	temp = temp.replace("TEMPLATE_VERSION", version);

	temp = temp.replace(`TEMPLATE_PIE_OS`, generatePie(usersValues.map((x) => x.platform)));
	temp = temp.replace(`TEMPLATE_PIE_HOST_VERSIONS`, generatePie(usersValues.map((x) => x.host_version)));
	temp = temp.replace(`TEMPLATE_PIE_HOST_CHANNELS`, generatePie(usersValues.map((x) => x.channel)));
	temp = temp.replace(`TEMPLATE_PIE_BRANCHES`, generatePie(usersValues.map((x) => x.branch)));
	temp = temp.replace(`TEMPLATE_PIE_API_VERSION`, generatePie(usersValues.map((x) => x.apiVersion)));

	temp = temp.replace(`TEMPLATE_PIE_CACHE`, generatePie(proxyCacheHitArr));
	temp = temp.replace(`TEMPLATE_PIE_VS`, generatePie(proxyVsRedirect));

	temp = temp.replace(`TEMPLATE_UPTIME`, getDiffTime(startTime));
	temp = temp.replace(`TEMPLATE_LAST_UPDATE`, getDiffTime(Math.max(...usersValues.map((x) => x.time))));

	for (let k in requestCounts) {
		temp = temp.replace(`TEMPLATE_COUNT_${k.toUpperCase()}`, requestCounts[k]);
	}

	return c.html(temp);
};
