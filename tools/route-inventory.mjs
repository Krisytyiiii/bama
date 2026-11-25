import fs from "node:fs/promises";
import path from "node:path";

// Heuristic inventory of every HTTP route registration. It resolves app.use mount
// prefixes and nested router mounts, so a refactor that moves files without
// changing URLs produces a byte-identical inventory.

const ROOT = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? ".");
const API_SRC = path.join(ROOT, "apps", "api", "src");
const LEGACY_SRC = path.join(ROOT, "backend", "src");
const SRC = await exists(API_SRC) ? API_SRC : LEGACY_SRC;
const OUT = path.join(ROOT, "docs", "architecture", "api-inventory.json");
const METHODS = ["get", "post", "put", "patch", "delete", "all"];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveModule(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function localImports(file) {
  const source = await fs.readFile(file, "utf8");
  const map = new Map();
  const pattern = /import\s+([A-Za-z0-9_$]+)\s+from\s+"(\.[^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    const resolved = await resolveModule(file, match[2]);
    if (resolved) map.set(match[1], resolved);
  }
  return { source, map };
}

function extractCalls(source, callee) {
  const calls = [];
  const needle = `${callee}(`;
  let index = source.indexOf(needle);
  while (index !== -1) {
    let depth = 1;
    let cursor = index + needle.length;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      const ch = source[cursor];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      cursor += 1;
    }
    calls.push(splitArgs(source.slice(start, cursor - 1)));
    index = source.indexOf(needle, cursor);
  }
  return calls;
}

function splitArgs(body) {
  const args = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function joinPath(prefix, suffix) {
  const left = prefix === "/" ? "" : prefix.replace(/\/+$/, "");
  const right = suffix === "/" ? "" : suffix.replace(/\/+$/, "");
  const joined = `${left}${right.startsWith("/") || right === "" ? right : `/${right}`}`;
  return joined === "" ? "/" : joined;
}

async function scanRouter(file, prefix, routes, stack = new Set()) {
  if (stack.has(`${file}::${prefix}`)) return;
  const nextStack = new Set(stack).add(`${file}::${prefix}`);
  const { source, map } = await localImports(file);

  const routePattern = new RegExp(`router\\.(${METHODS.join("|")})\\(\\s*["'\`]([^"'\`]*)["'\`]`, "g");
  for (const match of source.matchAll(routePattern)) {
    routes.push({ method: match[1].toUpperCase(), path: joinPath(prefix, match[2]), file: path.relative(ROOT, file).replaceAll("\\", "/") });
  }

  const chainPattern = /router\.route\(\s*["'`]([^"'`]*)["'`]\s*\)\s*\.([a-z]+)\(/g;
  for (const match of source.matchAll(chainPattern)) {
    if (!METHODS.includes(match[2])) continue;
    routes.push({ method: match[2].toUpperCase(), path: joinPath(prefix, match[1]), file: path.relative(ROOT, file).replaceAll("\\", "/") });
  }

  for (const args of extractCalls(source, "router.use")) {
    const last = args[args.length - 1]?.trim() ?? "";
    const target = map.get(last);
    if (!target) continue;
    const first = args[0]?.trim() ?? "";
    const prefixArg = args.length > 1 ? first.match(/^["'`]([^"'`]+)["'`]$/)?.[1] : undefined;
    await scanRouter(target, joinPath(prefix, prefixArg ?? ""), routes, nextStack);
  }
}

const appFile = path.join(SRC, "app.ts");
const { source: appSource } = await localImports(appFile);

const mounts = new Map();
const appImportPattern = /import\s+([A-Za-z0-9_$]+)\s+from\s+"(\.[^"]+)"/g;
for (const match of appSource.matchAll(appImportPattern)) {
  const resolved = await resolveModule(appFile, match[2]);
  if (resolved) mounts.set(match[1], resolved);
}

const routes = [];
for (const args of extractCalls(appSource, "app.use")) {
  const first = args[0]?.trim() ?? "";
  const last = args[args.length - 1]?.trim() ?? "";
  const prefix = first.match(/^["'`]([^"'`]+)["'`]$/);
  if (!prefix) continue;
  const target = mounts.get(last);
  if (target) await scanRouter(target, prefix[1], routes);
}

const appRoutePattern = new RegExp(`app\\.(${METHODS.join("|")})\\(\\s*["'\`]([^"'\`]*)["'\`]`, "g");
for (const match of appSource.matchAll(appRoutePattern)) {
  routes.push({ method: match[1].toUpperCase(), path: match[2], file: path.relative(ROOT, appFile).replaceAll("\\", "/") });
}

routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
const unique = [];
const seen = new Set();
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push({ method: route.method, path: route.path, file: route.file });
}

const report = { generatedAt: new Date().toISOString(), count: unique.length, routes: unique };

if (process.argv.includes("--check")) {
  const previous = await fs.readFile(OUT, "utf8").then(JSON.parse).catch(() => null);
  if (!previous) {
    console.error(`no baseline at ${path.relative(ROOT, OUT)} — run without --check first`);
    process.exit(2);
  }
  const before = new Set(previous.routes.map((r) => `${r.method} ${r.path}`));
  const after = new Set(unique.map((r) => `${r.method} ${r.path}`));
  const removed = [...before].filter((r) => !after.has(r));
  const added = [...after].filter((r) => !before.has(r));
  if (removed.length === 0 && added.length === 0) {
    console.log(`routes unchanged: ${unique.length}`);
    process.exit(0);
  }
  console.log(`routes changed: +${added.length} -${removed.length}`);
  for (const route of added) console.log(`  + ${route}`);
  for (const route of removed) console.log(`  - ${route}`);
  process.exit(1);
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const byPrefix = new Map();
for (const route of unique) {
  const prefix = `/${route.path.split("/").filter(Boolean).slice(0, 2).join("/")}`;
  byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
}

console.log(`routes: ${unique.length}`);
for (const [prefix, count] of [...byPrefix].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(3)}  ${prefix}`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
