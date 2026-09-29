import { parseEnv } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";

export const publicKeys = [
  "SITE_URL",
  "RUNTIME_DIR",
  "PUBLIC_HOST",
  "PUBLIC_PORT",
  "TRUST_PROXY",
  "CONTACT_ENABLED",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "CONTACT_FROM",
  "CONTACT_TO",
  "CONTACT_RECEIVER_NAME",
];
export function publicEnvironment(source) {
  const parsed = parseEnv(source);
  return (
    publicKeys
      .filter((key) => parsed[key] !== undefined)
      .map((key) => {
        const value = parsed[key];
        if (/[\r\n\0]/.test(value))
          throw new Error("Multiline public environment value");
        // systemd EnvironmentFile quoting, not shell evaluation.
        return (
          key + '="' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
        );
      })
      .join("\n") + "\n"
  );
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file://" + process.argv[1]).href
) {
  writeFileSync(
    process.argv[3],
    publicEnvironment(readFileSync(process.argv[2], "utf8")),
    { mode: 0o600, flag: "wx" },
  );
}
