// Remove BetterDiscord's preload override interception
// https://github.com/BetterDiscord/BetterDiscord/blob/1cfb9e1179ee249068be283331aff0789d2ebf1f/src/electron/main/modules/browserwindow.ts#L52
const origDefineProperty = Object.defineProperty;
Object.defineProperty = function (obj, prop, descriptor) {
	if (prop === "preload" && descriptor?.set?.toString()?.includes?.("clientModCompatibility")) {
		const value = descriptor?.get?.();
		if (value) obj[prop] = value;
		return obj;
	}
	return origDefineProperty.apply(this, arguments);
};

require("./betterdiscord.asar");
