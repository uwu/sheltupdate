const { ipcRenderer, webFrame } = require("electron");

ipcRenderer.invoke("SHELTER_BUNDLE_FETCH").then((bundle) => {
  webFrame.executeJavaScript(bundle);
});
