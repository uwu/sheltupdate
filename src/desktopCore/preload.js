const { ipcRenderer } = require("electron");

const originalPreload = ipcRenderer.sendSync("SHELTUPDATE_FRAMEWORK_ORIGINAL_PRELOAD");
if (originalPreload) require(originalPreload);

// START BRANCHES PRELOAD
__BRANCHES_PRELOAD__;