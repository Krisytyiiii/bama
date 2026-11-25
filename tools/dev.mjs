import { spawn } from "node:child_process";
import path from "node:path";

// Runs the whole product from one command: api on 4000, web on 3000.
// No dependency: plain child processes, prefixed output, one Ctrl+C teardown.

const ROOT = path.resolve(import.meta.dirname, "..");
const targets = [
  { name: "api", color: "\u001b[36m", cwd: path.join(ROOT, "apps", "api"), args: ["run", "dev"] },
  { name: "web", color: "\u001b[35m", cwd: path.join(ROOT, "apps", "web"), args: ["run", "dev"] },
];
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const selected = only.length ? targets.filter((t) => only.includes(t.name)) : targets;
const reset = "\u001b[0m";
const children = [];

for (const target of selected) {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", target.args, {
    cwd: target.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: process.env,
  });
  const label = `${target.color}[${target.name}]${reset}`;
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`${label} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code, signal) => {
    console.log(`${label} exited ${signal ?? code}`);
    if (!signal) shutdown();
  });
  children.push(child);
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
