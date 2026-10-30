const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = "https://aryankhan1002.github.io/ZMS/";
const ICON = path.join(__dirname, "..", "zeemal-health-clinic-logo.png");

// Google sign-in refuses browsers that call themselves "Electron",
// so present the app as a normal Chrome browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/[\d.]+/i, "")
  .replace(/\s[^\s/]+\/[\d.]+(?=\sChrome\/)/, "");

let win = null;

function loadLocalCopy() {
  if (!win) return;
  win.loadFile(path.join(__dirname, "..", "index.html")).catch(() => {});
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    title: "Zeemal Health Clinic",
    icon: ICON,
    backgroundColor: "#f2f7f4",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Always show the window, even if "ready-to-show" never fires.
  win.once("ready-to-show", () => win && win.show());
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }, 4000);

  // No internet (or the site is down): open the copy that is bundled in the app.
  win.webContents.on("did-fail-load", (event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && /^https?:/i.test(url)) loadLocalCopy();
  });

  // Google / Firebase sign-in popups open inside the app, everything else in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*(firebaseapp\.com|google\.com|googleapis\.com|gstatic\.com|accounts\.google\.com)\//i.test(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL).catch(() => loadLocalCopy());
  win.on("closed", () => {
    win = null;
  });
}

// Only one copy of the app at a time; opening it again just brings it to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
