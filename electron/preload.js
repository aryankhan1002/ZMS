const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zeemalDesktopAuth", {
  googleLogin: () => ipcRenderer.invoke("zeemal:google-login")
});
