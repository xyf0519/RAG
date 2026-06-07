import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with_desktop_env.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    APP_MODE: "desktop",
    NEXT_PUBLIC_APP_MODE: "desktop",
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
