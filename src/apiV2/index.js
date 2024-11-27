import {Hono} from "hono";

import {handleManifest} from "./manifest.js";
import {handleCustomModule, handleModule} from "./module.js";

export default new Hono()
	.get("/:branch/distributions/app/manifests/latest", handleManifest)
	.get("/:branch/distro/app/:channel/:platform/:arch/:hostVersion/:moduleName/:moduleVersion/full.distro", handleModule)
	.get("/custom_module/:moduleName/full.distro", handleCustomModule);