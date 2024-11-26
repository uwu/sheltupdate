# SheltUpdate

SheltUpdate is a fork of [GooseUpdate](https://github.com/goose-nest/gooseupdate),
which replicates Discord's update API, but injecting mods or other tweaks while serving modules.

This version has minor fixes to bring it up to date, and different branches, in line with its use for injecting shelter.

# Branches

Check the [shelter documentation](https://github.com/uwu/shelter/blob/main/README.md) for install instructions.

The uwu.network instance of sheltupdate hosts the branches exactly as found in this repository:
 - `shelter` - injects shelter
 - `vencord` - injects vencord. currently cannot coexist with shelter (WIP)
 - `betterdiscord` - injects BD.
 - `reactdevtools` - adds react dev tools to your client

# Deploying
1. Install SheltUpdate's dependencies with `npm install`
2. Copy `config.example.js` to `config.js` and modify it to your liking, then run `node src/index.js (PORT)`.

# Usage
Discord fetches the update API URL from a `settings.json` file stored in various directories depending on your operating system.

Said directories are found below:
* Windows:
  * `%appdata%\discord<channel>\settings.json`
* Mac:
  * `~/Library/Application Support/discord<channel>/settings.json`
* Linux:
  * Package Manager/tar.gz Installation: `~/.config/discord<channel>/settings.json`
  * Flatpak: `~/.var/app/com.discordapp.Discord/config/discord<channel>/settings.json`

Set `UPDATE_ENDPOINT` and `NEW_UPDATE_ENDPOINT` in `settings.json` as follows:

```json
"UPDATE_ENDPOINT": "https://<instance URL>/branch"
"NEW_UPDATE_ENDPOINT": "https://<instance URL>/branch/"
```

SheltUpdate also supports including multiple branches in updates by separating their names with a `+`, like `https://<instance URL>/branch1+branch2`.

# Adding a branch
SheltUpdate branches patch `discord_desktop_core` with files stored in `branches/<branch name>/`.

Branches must have a `patch.js` file to handle their injection in their branch directory, which is prepended to Discord's base `index.js` of the module.

```javascript
// Any code you want to inject goes here
require('mod.js')
```

If other files are in the branch directory, they will be added the module directory.

# Credits

GooseUpdate was originally written by [Ducko](https://github.com/CanadaHonk/).

The shelter injector code has been contributed to by most of uwu.network at this point, and is further adapted here.
