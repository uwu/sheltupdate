import { Hono } from "hono";
import { handleNonSquirrel, handleSquirrel } from "./host.js";
import { handleModuleDownload } from "./moduleDownload/index.js";
import { handleModules } from "./modules.js";

export default new Hono()
	.get("/:branch/updates/:channel", handleNonSquirrel)
	.get("/:branch/updates/:channel/releases", handleSquirrel)
	.get("/:branch/modules/:channel/:module/:version", handleModuleDownload)
	.get("/:branch/modules/:channel/versions.json", handleModules);
