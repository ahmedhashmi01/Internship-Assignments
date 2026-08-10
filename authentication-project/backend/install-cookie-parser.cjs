const { spawnSync } = require("child_process");
const path = require("path");
const cwd = path.resolve(__dirname);
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
console.log("Installing cookie-parser in", cwd);
const result = spawnSync(npmCmd, ["install", "cookie-parser"], {
  cwd,
  stdio: "inherit",
});
if (result.error) {
  console.error("Install failed:", result.error);
  process.exit(1);
}
process.exit(result.status || 0);
