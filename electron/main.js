const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const APP_URL = "https://aryankhan1002.github.io/ZMS/";
const ICON = path.join(__dirname, "..", "zeemal-health-clinic-logo.png");
const GOOGLE_DESKTOP_CLIENT_ID = "84919046289-53hd5vsphcehv9u20q8ouiogki1fnn6a.apps.googleusercontent.com";

app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/[\d.]+/i, "")
  .replace(/\s[^\s/]+\/[\d.]+(?=\sChrome\/)/, "");

let win = null;
let oauthServer = null;

function loadLocalCopy() {
  if (!win) return;
  win.loadFile(path.join(__dirname, "..", "index.html")).catch(() => {});
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function startGoogleOAuth() {
  return new Promise((resolve, reject) => {
    if (oauthServer) {
      reject(new Error("A Google sign-in is already in progress."));
      return;
    }

    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const state = base64url(crypto.randomBytes(24));
    let redirectUri = "";
    let timeout = null;

    const server = http.createServer(async (req, res) => {
      const callbackUrl = new URL(req.url, "http://127.0.0.1");
      if (callbackUrl.pathname !== "/oauth2callback") {
        res.writeHead(404).end("Not found");
        return;
      }

      if (callbackUrl.searchParams.get("state") !== state) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Invalid sign-in state. You can close this tab.");
        cleanup();
        reject(new Error("Google sign-in state did not match."));
        return;
      }

      const oauthError = callbackUrl.searchParams.get("error");
      const code = callbackUrl.searchParams.get("code");
      if (oauthError || !code) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Google sign-in was cancelled or failed. You can close this tab.");
        cleanup();
        reject(new Error(oauthError || "Google did not return an authorization code."));
        return;
      }

      try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_DESKTOP_CLIENT_ID,
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri
          })
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.id_token) {
          throw new Error(tokenData.error_description || tokenData.error || "Google did not return an ID token.");
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><title>Sign-in complete</title><p>Google sign-in complete. You can close this tab and return to Zeemal Health Clinic.</p>");
        cleanup();
        resolve(tokenData.id_token);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" }).end("Sign-in could not be completed. Return to Zeemal Health Clinic.");
        cleanup();
        reject(error);
      }
    });

    function cleanup() {
      if (timeout) clearTimeout(timeout);
      if (oauthServer === server) oauthServer = null;
      try { server.close(); } catch (_) {}
    }

    oauthServer = server;
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Google sign-in timed out. Please try again."));
    }, 5 * 60 * 1000);
    if (typeof timeout.unref === "function") timeout.unref();

    server.on("error", error => {
      cleanup();
      reject(error);
    });

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.search = new URLSearchParams({
        client_id: GOOGLE_DESKTOP_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account"
      }).toString();

      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  });
}

ipcMain.handle("zeemal:google-login", async () => startGoogleOAuth());

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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.once("ready-to-show", () => win && win.show());
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }, 4000);

  win.webContents.on("did-fail-load", (event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && /^https?:/i.test(url)) loadLocalCopy();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL).catch(() => loadLocalCopy());
  win.on("closed", () => {
    win = null;
  });
}

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
  app.on("before-quit", () => {
    if (oauthServer) {
      try { oauthServer.close(); } catch (_) {}
      oauthServer = null;
    }
  });
}
