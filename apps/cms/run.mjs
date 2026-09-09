import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
try {
  loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../node_modules/next/dist/bin/next", import.meta.url),
    ),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
