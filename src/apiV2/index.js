import { Hono } from "hono";

import { handleManifest } from "./manifest.js";
import { handleModule } from "./module.js";

export default new Hono()
	.get("/:branch/distributions/app/manifests/latest", handleManifest)
	.get(
		"/:branch/distro/app/:channel/:platform/:arch/:hostVersion/:moduleName/:moduleVersion/full.distro",
		handleModule,
	);
