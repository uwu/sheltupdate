import basicProxy from "../common/proxy/index.js";
import { patch } from "./patchModule.js";
import { config } from "../common/config.js";
import { ensureBranchIsReady, getBranch } from "../common/branchesLoader.js";
import { reportEndpoint, reportUniqueUser } from "../dashboard/reporting.js";
import originatingIp from "../common/originatingIp.js";
import { log, withLogSection } from "../common/logger.js";

const base = config.apiBases.v2;
const host = config.host;

// https://discord.com/api/updates/distributions/app/manifests/latest?channel=canary&platform=win&arch=x86

export const handleManifest = withLogSection("v2 manifest", async (c) => {
	const branch = c.req.param("branch");
	if (!getBranch(branch)) {
		return c.notFound("Invalid sheltupdate branch");
	}

	log(JSON.stringify(c.req.param()), JSON.stringify(c.req.query()));

	reportEndpoint("v2_manifest");

	reportUniqueUser(
		originatingIp(c),
		c.req.query("platform"),
		`${c.req.query("platform")} ${c.req.query("platform_version")}`,
		c.req.query("channel"),
		branch,
		2
	);

	let json = await basicProxy(c, {}, undefined, base).then((r) => r.json());

	const branchNames = branch.split("+");
	await Promise.all(branchNames.map((b) => ensureBranchIsReady(b)));

	json.modules.discord_desktop_core.deltas = []; // Remove deltas

	const oldVersion = json.modules.discord_desktop_core.full.module_version;
	const newVersion = parseInt(`${getBranch(branch).version}${oldVersion.toString()}`);

	// Modify version to prefix branch's version
	json.modules.discord_desktop_core.full.module_version = newVersion;

	json.modules.discord_desktop_core.full.package_sha256 = await patch(json.modules.discord_desktop_core.full, branch);

	// Modify URL to use this host
	json.modules.discord_desktop_core.full.url = `${host}/${branch}/${json.modules.discord_desktop_core.full.url.split("/").slice(3).join("/").replace(`${oldVersion}/full.distro`, `${newVersion}/full.distro`)}`;

	return c.json(json);
});

/*
  - Similar to branches except this is way more general use
  - Formatted as JSON

  - Method:
    - Proxy original request
    - Target: discord_desktop_core:
      - Update module version
      - Pre-patch module:
        - Check if already patched in disk cache
        - If so:
          - We will just send cached file later
        - If not:
          - Download original module
          - Uncompress:
            - Brotli decompress
            - Extract tar
          - Patch:
            - Patch index.js
            - Update checksum in delta manifest
            - UNKNOWN - needs testing:
              - Add files to files/
              - [?] Add files to files/manifest.json
              - [?] Add files to delta manifest
              (- Avoiding those extra steps unless needed)
          - Recompress:
            - Package into tar
            - Brotli compress
        - Overwrite url with new self url
        - Overwrite checksum with new checksum
    - UNKNOWN - needs testing:
      - [?] Remove deltas - so client is forced to use full (it might depend on them?)
      - [?] Generate new deltas - this will require way more work
*/
