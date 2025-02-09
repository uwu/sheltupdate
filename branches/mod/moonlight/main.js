const asarPath = require("electron").app.getAppPath();
// disableLoad => Does not try to load the original app.asar once injector.js finishes
// disablePersist => Does not try to traditionally persist throughout win32 host updates
await require("./moonlight/injector.js").inject(asarPath, { disableLoad: true, disablePersist: true });
