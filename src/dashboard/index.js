import { readFileSync } from "fs";
import { join } from "path";
import { statsState } from "./reporting.js";
import { srcDir, startTime, version } from "../common/config.js";

const indexTemplate = readFileSync(join(srcDir, "dashboard", "template.html"), "utf8");
/*
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
};*/

export const handleDashboard = (c) => {
	let temp = indexTemplate.slice(); // fs.readFileSync('index.html', 'utf8'); //  //
	temp = temp.replaceAll("{USER_COUNT}", Object.values(statsState.uniqueUsers).length);
	temp = temp.replaceAll("{VERSION}", version);

	temp = temp.replaceAll("{STATE}", JSON.stringify(statsState));

	temp = temp.replaceAll("{START_TIME}", startTime);

	return c.html(temp);
};
