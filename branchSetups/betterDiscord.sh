#!/bin/sh
# This script downloads BD's latest asar release

cd "../branches/mod/betterdiscord/"

asarPath="betterdiscord.asar"

# Remove current / old asar
echo "Removing old asar..."

rm -f "$asarPath"

# Download via latest GitHub release
echo "Downloading new asar..."

# Based on https://gist.github.com/steinwaywhw/a4cd19cda655b8249d908261a62687f8
curl -sLo "$asarPath" $(\
	curl -s https://api.github.com/repos/BetterDiscord/BetterDiscord/releases/latest \
	| grep "browser_download_url.*betterdiscord.asar" \
	| cut -d '"' -f 4)

echo "Replacing process.platform specific checks..."

asar extract "$asarPath" "ex"

sed -i 's/"win32"==process.platform||"darwin"==process.platform/false/g' "ex/injector.js"

asar pack "ex" "$asarPath"

rm -rf "ex"
