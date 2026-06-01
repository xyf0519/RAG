#!/usr/bin/env node

if (process.platform !== "win32") {
  console.error("Windows EXE packages must be built on Windows so PyInstaller can create maverella-backend.exe.");
  console.error("Run `npm run desktop:dist:win` from the web/ directory on a Windows machine or Windows CI runner.");
  process.exit(1);
}
