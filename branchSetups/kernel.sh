#!/bin/sh
# This script downloads Kernel's latest asar release

# WARNING: kernel currently not working as it relies on being injected before app ready

cd "../branches/mod/kernel/"

asarPath="kernel.asar"

# Remove current / old asar
echo "Removing old asar..."

rm -f "$asarPath"

# Download via latest GitHub release
echo "Downloading new asar..."

# Based on https://gist.github.com/steinwaywhw/a4cd19cda655b8249d908261a62687f8
curl -sLo "$asarPath" $(\
	curl -s https://api.github.com/repos/kernel-mod/electron/releases/latest \
	| grep "browser_download_url.*kernel.asar" \
	| cut -d '"' -f 4)

echo "Patching out scheme CSP bypass..."

asar extract "$asarPath" "ex"

sed -i -E 's/_electron.protocol.registerSchemesAsPrivileged.*_electron.app.on\("r/_electron.app.on("r/g' "ex/main/registerProtocols.js"

asar pack "ex" "$asarPath"

rm -rf "ex"
