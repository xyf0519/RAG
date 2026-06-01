const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

const PREFERRED_BACKEND_PORT = Number(process.env.XYFRAG_DESKTOP_BACKEND_PORT || 8765);
const PREFERRED_FRONTEND_PORT = Number(process.env.XYFRAG_DESKTOP_FRONTEND_PORT || 3765);

app.setName("Maverella");

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;
let backendPort = PREFERRED_BACKEND_PORT;
let frontendPort = PREFERRED_FRONTEND_PORT;

function getRepoRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..", "..");
  }
  const resourceRoot = process.resourcesPath;
  const candidate = path.join(resourceRoot, "rag");
  return fs.existsSync(candidate) ? candidate : path.resolve(resourceRoot, "..");
}

function getWebRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..");
  }
  return app.getAppPath();
}

function getUserDataRoot() {
  const root = path.join(app.getPath("userData"), "rag-data");
  fs.mkdirSync(root, { recursive: true });
  for (const child of ["data", "models", "logs"]) {
    fs.mkdirSync(path.join(root, child), { recursive: true });
  }
  return root;
}

function getDesktopLogPath() {
  const root = path.join(app.getPath("userData"), "rag-data", "logs");
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, "desktop-processes.log");
}

function appendDesktopLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (app.isReady() || app.isPackaged) {
    fs.appendFileSync(getDesktopLogPath(), line);
  } else {
    console.log(line.trim());
  }
}

function copyDirectoryIfEmpty(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  const existing = fs.existsSync(target) ? fs.readdirSync(target) : [];
  if (existing.length > 0) {
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function seedDesktopData(repoRoot, dataRoot) {
  copyDirectoryIfEmpty(path.join(repoRoot, "data", "raw"), path.join(dataRoot, "data", "raw"));
}

function pickPython() {
  const repoRoot = getRepoRoot();
  const bundledBackend = process.platform === "win32"
    ? path.join(process.resourcesPath, "backend", "maverella-backend.exe")
    : path.join(process.resourcesPath, "backend", "maverella-backend");
  if (app.isPackaged && fs.existsSync(bundledBackend)) {
    return bundledBackend;
  }
  const venvPython = process.platform === "win32"
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function isBundledBackend(command) {
  const basename = path.basename(command).toLowerCase();
  return basename === "maverella-backend" || basename === "maverella-backend.exe";
}

function spawnLogged(command, args, options) {
  const stdio = app.isPackaged
    ? ["ignore", fs.openSync(getDesktopLogPath(), "a"), fs.openSync(getDesktopLogPath(), "a")]
    : "inherit";
  const child = spawn(command, args, {
    ...options,
    stdio,
    windowsHide: true,
  });
  child.on("exit", (code) => {
    appendDesktopLog(`process exited command=${command} code=${code}`);
    if (!app.isQuitting && code !== 0 && code !== null) {
      console.error(`${command} exited with ${code}`);
    }
  });
  return child;
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Keep polling until the child process finishes booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(700);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function backendHealthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data && data.ok === true && data.app === "Maverella";
  } catch {
    return false;
  }
}

function freePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.on("error", reject);
      fallback.listen(0, "127.0.0.1", () => {
        const address = fallback.address();
        const port = typeof address === "object" && address ? address.port : preferredPort;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });
  });
}

async function startBackend() {
  if (await backendHealthy(PREFERRED_BACKEND_PORT)) {
    backendPort = PREFERRED_BACKEND_PORT;
    appendDesktopLog(`reusing healthy backend port=${backendPort}`);
    return;
  }
  backendPort = await freePort(PREFERRED_BACKEND_PORT);

  const repoRoot = getRepoRoot();
  const dataRoot = getUserDataRoot();
  seedDesktopData(repoRoot, dataRoot);
  const env = {
    ...process.env,
    APP_MODE: "desktop",
    XYFRAG_DESKTOP: "1",
    XYFRAG_BOUNDARY_ENABLED: "0",
    XYFRAG_RETRIEVAL_USE_LOCAL_MODELS: "0",
    PYTHONPATH: path.join(repoRoot, "src"),
    XYFRAG_PROJECT_ROOT: repoRoot,
    XYFRAG_DATA_DIR: path.join(dataRoot, "data"),
    XYFRAG_MODELS_DIR: path.join(dataRoot, "models"),
    XYFRAG_LOGS_DIR: path.join(dataRoot, "logs"),
    RAG_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
  };

  const backendCommand = pickPython();
  const backendArgs = isBundledBackend(backendCommand)
    ? [
        "--host",
        "127.0.0.1",
        "--port",
        String(backendPort),
        "--data-dir",
        path.join(dataRoot, "data"),
        "--models-dir",
        path.join(dataRoot, "models"),
        "--logs-dir",
        path.join(dataRoot, "logs"),
      ]
    : ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(backendPort)];

  appendDesktopLog(`starting backend command=${backendCommand} port=${backendPort} packaged=${app.isPackaged}`);
  backendProcess = spawnLogged(backendCommand, backendArgs, { cwd: repoRoot, env });
  await waitForHttp(`http://127.0.0.1:${backendPort}/health`, 240_000);
}

async function startFrontend() {
  frontendPort = await canConnect(PREFERRED_FRONTEND_PORT, "127.0.0.1")
    ? await freePort(0)
    : PREFERRED_FRONTEND_PORT;

  const webRoot = getWebRoot();
  const env = {
    ...process.env,
    APP_MODE: "desktop",
    NEXT_PUBLIC_APP_MODE: "desktop",
    NODE_ENV: "production",
    RAG_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
  };
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

  frontendProcess = spawnLogged(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
    { cwd: webRoot, env: { ...env, ELECTRON_RUN_AS_NODE: "1" } },
  );
  appendDesktopLog(`starting frontend port=${frontendPort} backend_port=${backendPort}`);
  await waitForHttp(`http://127.0.0.1:${frontendPort}`, 180_000);
}

function loadingHtml(message) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        background: #f7f9f8;
        color: #17201c;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(440px, calc(100vw - 48px)); }
      h1 { margin: 0 0 10px; font-size: 26px; font-weight: 720; letter-spacing: 0; }
      p { margin: 0; color: #66736d; font-size: 15px; line-height: 1.6; }
      .bar { height: 4px; margin-top: 24px; overflow: hidden; border-radius: 999px; background: #dfe7e2; }
      .bar::before {
        content: "";
        display: block;
        width: 38%;
        height: 100%;
        border-radius: inherit;
        background: #188756;
        animation: move 1.2s ease-in-out infinite;
      }
      @keyframes move {
        0% { transform: translateX(-105%); }
        100% { transform: translateX(275%); }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Maverella</h1>
      <p>${message}</p>
      <div class="bar" aria-hidden="true"></div>
    </main>
  </body>
</html>`;
}

async function showLoading(message) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml(message))}`);
}

async function createWindow(message = "正在初始化本机资料库，马上进入工作台。") {
  if (mainWindow && !mainWindow.isDestroyed()) {
    await showLoading(message);
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    title: "Maverella",
    backgroundColor: "#f7f9f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await showLoading(message);
}

async function boot() {
  try {
    await createWindow();
    await showLoading("正在启动本地 RAG 后端，首次启动会自动准备默认资料库。");
    await startBackend();
    await showLoading("正在打开工作台。");
    await startFrontend();
    await mainWindow.loadURL(`http://127.0.0.1:${frontendPort}`);
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await showLoading("启动失败，请查看本机日志后重试。");
    }
    dialog.showErrorBox("Maverella 启动失败", error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

function stopChildren() {
  for (const child of [frontendProcess, backendProcess]) {
    if (child && !child.killed) {
      child.kill();
    }
  }
}

app.whenReady().then(boot);

app.on("before-quit", () => {
  app.isQuitting = true;
  stopChildren();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void boot();
  }
});
