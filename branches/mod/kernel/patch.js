// WARNING: kernel currently not working as it relies on being injected before app ready

const electron = require("electron");

// we patched out the csp bypasses for kernel:// and kernel-sync://
// so add them in here

electron.session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders }, done) => {
	const cspHeaders = Object.keys(responseHeaders).filter((name) =>
		name.toLowerCase().startsWith("content-security-policy")
	);

	for (const header of cspHeaders) {
		responseHeaders[header] = responseHeaders[header] + "default-src 'self' kernel:; default-src 'self' kernel-sync:; ";
	}

	done({ responseHeaders });
});

try {
  const kernel = require("./kernel.asar");
  if (kernel?.default) kernel.default({ startOriginal: false });
} catch(e) {
  console.error("Kernel failed to load: ", e.message);
  //Module._load(path.join(__dirname, "..", "app-original.asar"), null, true);
}
