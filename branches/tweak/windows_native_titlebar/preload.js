const { webFrame } = require("electron");

webFrame.insertCSS("[class*=titleBar]{display: none!important}");
