const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

const BACKEND_PORT = Number(process.env.XYFRAG_DESKTOP_BACKEND_PORT || 8765);
const FRONTEND_PORT = Number(process.env.XYFRAG_DESKTOP_FRONTEND_PORT || 3765);

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

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
    ? path.join(process.resourcesPath, "backend", "xyfrag-backend.exe")
    : path.join(process.resourcesPath, "backend", "xyfrag-backend");
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
  return basename === "xyfrag-backend" || basename === "xyfrag-backend.exe";
}

function spawnLogged(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });
  child.on("exit", (code) => {
    if (!app.isQuitting && code !== 0 && code !== null) {
      console.error(`${command} exited with ${code}`);
    }
  });
  return child;
}

async function waitForPort(port, host = "127.0.0.1", timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
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

async function startBackend() {
  if (await canConnect(BACKEND_PORT, "127.0.0.1")) {
    return;
  }

  const repoRoot = getRepoRoot();
  const dataRoot = getUserDataRoot();
  seedDesktopData(repoRoot, dataRoot);
  const env = {
    ...process.env,
    APP_MODE: "desktop",
    XYFRAG_DESKTOP: "1",
    PYTHONPATH: path.join(repoRoot, "src"),
    XYFRAG_DATA_DIR: path.join(dataRoot, "data"),
    XYFRAG_MODELS_DIR: path.join(dataRoot, "models"),
    XYFRAG_LOGS_DIR: path.join(dataRoot, "logs"),
    RAG_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
  };

  const backendCommand = pickPython();
  const backendArgs = isBundledBackend(backendCommand)
    ? ["--host", "127.0.0.1", "--port", String(BACKEND_PORT)]
    : ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)];

  backendProcess = spawnLogged(backendCommand, backendArgs, { cwd: repoRoot, env });
  await waitForPort(BACKEND_PORT);
}

async function startFrontend() {
  if (await canConnect(FRONTEND_PORT, "127.0.0.1")) {
    return;
  }

  const webRoot = getWebRoot();
  const env = {
    ...process.env,
    APP_MODE: "desktop",
    NEXT_PUBLIC_APP_MODE: "desktop",
    NODE_ENV: "production",
    RAG_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
  };
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

  frontendProcess = spawnLogged(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(FRONTEND_PORT)],
    { cwd: webRoot, env: { ...env, ELECTRON_RUN_AS_NODE: "1" } },
  );
  await waitForPort(FRONTEND_PORT);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    title: "xyfRAG",
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

  await mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);
}

async function boot() {
  try {
    await startBackend();
    await startFrontend();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox("xyfRAG 启动失败", error instanceof Error ? error.message : String(error));
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
    void createWindow();
  }
});
