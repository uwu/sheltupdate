#!/bin/sh
# This script downloads Vencord's latest release

cd "../branches/mod/vencord/"

extractedPath="vencord-desktop"
#asarPath="desktop.asar"

# Remove current / old asar
echo "Removing old release..."

rm -rf "$extractedPath"

echo "Downloading latest release..."

mkdir -p "$extractedPath"

for file in Main.js Preload.js Renderer.css Renderer.js; do
	curl -sL https://github.com/Vendicated/Vencord/releases/download/devbuild/vencordDesktop$file \
		-o "$extractedPath/vencordDesktop"$file

	curl -sL https://github.com/Vendicated/Vencord/releases/download/devbuild/vencordDesktop$file.map \
		-o "$extractedPath/vencordDesktop"$file.map
done
