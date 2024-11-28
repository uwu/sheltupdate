#!/bin/sh
# This script downloads Vencord's latest release

cd "../branches/mod/vencord/"

extractedPath="vencord-desktop"

releaseUrl="https://github.com/Vendicated/Vencord/releases/download/devbuild"

# Remove current / old asar
echo "Removing old release..."

rm -rf "$extractedPath"

echo "Downloading latest release..."

mkdir -p "$extractedPath"

for file in vencordDesktopMain.js vencordDesktopPreload.js renderer.js vencordDesktopRenderer.css; do
	curl -sL $releaseUrl/$file     -o "$extractedPath/"$file
	curl -sL $releaseUrl/$file.map -o "$extractedPath/"$file.map
done
