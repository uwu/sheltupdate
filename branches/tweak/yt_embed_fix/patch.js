const electron = require("electron");

electron.session.defaultSession.webRequest.onBeforeSendHeaders(
	{ urls: ["https://www.youtube.com/embed/*"] },
	({ requestHeaders, url }, callback) => {
		requestHeaders["Referer"] = url;
		callback({ requestHeaders });
	},
);
