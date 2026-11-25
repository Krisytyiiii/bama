import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? ".");
const OUT = path.join(ROOT, "docs", "architecture", "metrics.json");

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  ".turbo", ".vercel", "generated", "qa-output", ".tesseract-cache",
]);

const ALLOWLIST = new Set([
  "prisma/schema.prisma",
  "prisma/migrations",
  "generated/prisma",
]);

const CAPS = {
  default: 250,
  routes: 150,
  service: 220,
  repository: 220,
  component: 200,
  css: 400,
  function: 45,
};

const WARN = {
  default: 200,
  routes: 120,
  service: 180,
  component: 150,
  css: 300,
  function: 30,
};

function classify(rel) {
  const file = rel.replaceAll("\\", "/");
  if (file.endsWith(".module.css")) return "cssmodule";
  if (file.endsWith(".css")) return "css";
  if (file.endsWith(".routes.ts") || file.endsWith("/app.ts")) return "routes";
  if (file.endsWith(".repository.ts")) return "repository";
  if (file.endsWith(".tsx")) return "component";
  if (file.includes("/services/") || file.endsWith(".service.ts") || file.endsWith(".usecase.ts")) return "service";
  return "default";
}

function isAllowed(rel) {
  const file = rel.replaceAll("\\", "/");
  for (const entry of ALLOWLIST) if (file.includes(entry)) return true;
  if (file.startsWith("apps/web/src/app/(print)")) return true;
  return false;
}

function measureFunctions(source) {
  const over = [];
  const lines = source.split("\n");
  const decl = /^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_$]+)|const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\()/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(decl);
    if (!m) continue;
    const name = m[1] ?? m[2];
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < lines.length; j += 1) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth += 1; started = true; }
        else if (ch === "}") depth -= 1;
      }
      if (started && depth <= 0) { end = j; break; }
    }
    const size = end - i + 1;
    if (size > CAPS.function) over.push({ name, line: i + 1, lines: size });
  }
  return over;
}

function countComments(source) {
  const lines = source.split("\n");
  let phrase = 0;
  let block = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock || line.startsWith("/*")) {
      block += 1;
      if (line.includes("*/")) inBlock = false;
      else inBlock = true;
      continue;
    }
    if (line.startsWith("//")) {
      phrase += 1;
      consecutive += 1;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      continue;
    }
    consecutive = 0;
  }
  return { phrase, block, maxConsecutive };
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
      continue;
    }
    if (/\.(ts|tsx|mjs|cjs|css)$/.test(entry.name)) yield full;
  }
}

const files = [];
const violations = [];

for await (const full of walk(ROOT)) {
  const rel = path.relative(ROOT, full).replaceAll("\\", "/");
  if (isAllowed(rel)) continue;
  const source = await fs.readFile(full, "utf8");
  const total = source.split("\n").length;
  const kind = classify(rel);
  const comments = countComments(source);
  const entry = { file: rel, kind, lines: total, commentRatio: total ? +(comments.phrase / total).toFixed(4) : 0, maxCommentRun: comments.maxConsecutive, blockComments: comments.block };
  files.push(entry);

  if (kind === "cssmodule") violations.push({ rule: "css-module", file: rel, lines: total });
  if (total > CAPS[kind]) violations.push({ rule: "file-size", file: rel, lines: total, cap: CAPS[kind] });
  if (total > WARN[kind]) entry.warnFileSize = true;
  if (entry.commentRatio > 0.05) violations.push({ rule: "comment-ratio", file: rel, ratio: entry.commentRatio });
  if (comments.maxConsecutive > 2) violations.push({ rule: "comment-run", file: rel, run: comments.maxConsecutive });
  if (comments.block > 0) violations.push({ rule: "block-comment", file: rel, count: comments.block });

  const bigFunctions = measureFunctions(source);
  for (const fn of bigFunctions) violations.push({ rule: "function-size", file: rel, name: fn.name, line: fn.line, lines: fn.lines, cap: CAPS.function });
}

files.sort((a, b) => b.lines - a.lines);

const byKind = {};
for (const file of files) {
  byKind[file.kind] ??= { files: 0, lines: 0 };
  byKind[file.kind].files += 1;
  byKind[file.kind].lines += file.lines;
}

const report = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  caps: CAPS,
  totals: {
    files: files.length,
    lines: files.reduce((sum, f) => sum + f.lines, 0),
    violations: violations.length,
  },
  byKind,
  largest: files.slice(0, 25),
  violations: violations.sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0)),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const top = report.largest.slice(0, 10).map((f) => `  ${String(f.lines).padStart(5)}  ${f.file}`).join("\n");
console.log(`files: ${report.totals.files}  lines: ${report.totals.lines}  violations: ${report.totals.violations}`);
console.log("largest:");
console.log(top);
console.log(`wrote ${path.relative(ROOT, OUT)}`);

if (process.argv.includes("--fail")) process.exit(report.totals.violations > 0 ? 1 : 0);
