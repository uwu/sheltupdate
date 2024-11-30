import basicProxy from "../common/proxy/index.js";
import { patch, createModule } from "./patchModule.js";
import {config} from "../common/config.js";
import {branches} from "../common/branchesLoader.js";
import {requestCounts, uniqueUsers} from "../common/state.js";

const base = config.apiBases.v2;
const host = config.host;

// https://discord.com/api/updates/distributions/app/manifests/latest?channel=canary&platform=win&arch=x86

export const handleManifest = async (c) => {
	const branch = c.req.param("branch");
	if (!branches[branch]) {
		return c.notFound("Invalid sheltupdate branch");
	}

	requestCounts.v2_manifest++;

	const ip = originatingIp(c);

	uniqueUsers[ip] = {
		platform: c.req.query("platform"),
		host_version: "unknown",
		channel: c.req.query("channel"),
		branch: branch,
		apiVersion: "v2",
		time: Date.now(),
	};

	let json = await basicProxy(c, {}, undefined, base).then(r => r.json());

	const branchModules = branch.split("+").map((x) => `goose_${x}`);

	json.required_modules = json.required_modules.concat(branchModules);

	const currentHostVersion = json.modules["discord_desktop_core"].full.host_version;

	for (let m of branchModules) {
		json.modules[m] = {
			full: {
				host_version: currentHostVersion,
				module_version: branches[m.substring(6)].version,
				package_sha256: await createModule(m.substring(6), branches[m.substring(6)]),
				url: `${host}/custom_module/${m}/full.distro`,
			},
			deltas: [],
		};
	}

	console.log(json);

	json.modules.discord_desktop_core.deltas = []; // Remove deltas

	const oldVersion = json.modules.discord_desktop_core.full.module_version;
	const newVersion = parseInt(`${branches[branch].version}${oldVersion.toString()}`);

	// Modify version to prefix branch's version
	json.modules.discord_desktop_core.full.module_version = newVersion;

	json.modules.discord_desktop_core.full.package_sha256 = await patch(
		json.modules.discord_desktop_core.full,
		branch,
	);

	// Modify URL to use this host
	json.modules.discord_desktop_core.full.url = `${host}/${branch}/${json.modules.discord_desktop_core.full.url.split("/").slice(3).join("/").replace(`${oldVersion}/full.distro`, `${newVersion}/full.distro`)}`;

	console.log(json.modules.discord_desktop_core);

	return c.json(json);
};

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
