import { readFileSync } from "fs";
import { join } from "path";
import { srcDir } from "../common/config.js";
import { createHash } from "crypto";

export const dcMain = readFileSync(join(srcDir, "desktopCore", "main.js"), "utf8");
export const dcPreload = readFileSync(join(srcDir, "desktopCore", "preload.js"), "utf8");

export const dcVersion = parseInt(
	createHash("sha256")
		.update(dcMain + dcPreload)
		.digest("hex")
		.substring(0, 2),
	16,
);
