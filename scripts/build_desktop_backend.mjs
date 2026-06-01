#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";
const backendName = isWindows ? "maverella-backend.exe" : "maverella-backend";
const addDataSeparator = isWindows ? ";" : ":";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canRun(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function pythonCommand() {
  if (process.env.PYTHON) {
    return process.env.PYTHON;
  }
  const venvPython = isWindows
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return isWindows ? "python" : "python3";
}

function localModelRuntimeAvailable(python) {
  return canRun(python, [
    "-c",
    "import FlagEmbedding, sentence_transformers, torch, transformers, tokenizers, safetensors",
  ]);
}

function addData(source, target) {
  return `${source}${addDataSeparator}${target}`;
}

const python = pythonCommand();

if (!canRun(python, ["-m", "PyInstaller", "--version"])) {
  run(python, ["-m", "pip", "install", "-r", "requirements-desktop-build.txt"]);
}

if (!localModelRuntimeAvailable(python)) {
  console.log("Installing local BGE runtime for desktop backend.");
  run(python, ["-m", "pip", "install", "-r", "requirements.txt", "-r", "requirements-local-models.txt"]);
}

if (!localModelRuntimeAvailable(python)) {
  console.error("Local BGE runtime is required for desktop packaging but could not be imported.");
  process.exit(1);
}

const backendDir = path.join(root, "web", "build", "backend");
const pyinstallerCacheDir = path.join(root, "build", "pyinstaller-cache");
fs.rmSync(path.join(root, "build", "pyinstaller"), { recursive: true, force: true });
fs.rmSync(path.join(root, "dist", backendName), { recursive: true, force: true });
fs.rmSync(backendDir, { recursive: true, force: true });
fs.mkdirSync(backendDir, { recursive: true });
fs.mkdirSync(pyinstallerCacheDir, { recursive: true });

const pyinstallerArgs = [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name",
  "maverella-backend",
  "--workpath",
  path.join(root, "build", "pyinstaller"),
  "--specpath",
  path.join(root, "build", "pyinstaller"),
  "--distpath",
  path.join(root, "dist"),
  "--paths",
  root,
  "--paths",
  path.join(root, "src"),
  "--add-data",
  addData(path.join(root, "app"), "app"),
  "--add-data",
  addData(path.join(root, "config"), "config"),
  "--add-data",
  addData(path.join(root, "data", "raw"), path.join("data", "raw")),
];

pyinstallerArgs.push(
  "--collect-all",
  "FlagEmbedding",
  "--collect-all",
  "sentence_transformers",
  "--collect-all",
  "transformers",
  "--collect-all",
  "tokenizers",
  "--collect-all",
  "safetensors",
  "--collect-all",
  "torch",
);
console.log("Including local BGE runtime in desktop backend.");

pyinstallerArgs.push(path.join(root, "desktop", "backend_entry.py"));
run(python, pyinstallerArgs, {
  env: {
    ...process.env,
    PYINSTALLER_CONFIG_DIR: pyinstallerCacheDir,
  },
});

const builtBackend = path.join(root, "dist", backendName);
const packagedBackend = path.join(backendDir, backendName);
fs.copyFileSync(builtBackend, packagedBackend);
if (!isWindows) {
  fs.chmodSync(packagedBackend, 0o755);
}
console.log(`Built desktop backend: ${packagedBackend}`);
