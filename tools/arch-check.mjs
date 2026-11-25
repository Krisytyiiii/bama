import fs from "node:fs/promises";
import path from "node:path";

// Layering gate. Non-strict during the refactor (reports), strict once P3/P4 land.
// Run with --strict in CI when the migration reaches its target state.

const ROOT = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? ".");
const STRICT = process.argv.includes("--strict");
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "generated", "qa-output"]);

const RULES = [
  { id: "web-no-api", applies: (rel) => rel.startsWith("apps/web/"), pattern: /from\s+["'][^"']*apps\/api|from\s+["']@prisma\/client|from\s+["']\.\.\/\.\.\/api/, message: "web must not import the API app or Prisma" },
  { id: "web-no-backend", applies: (rel) => rel.startsWith("apps/web/"), pattern: /from\s+["'][^"']*\/backend\//, message: "web must not import legacy backend paths" },
  { id: "mobile-no-web", applies: (rel) => rel.startsWith("apps/mobile/"), pattern: /from\s+["'](next|react-dom)|from\s+["'][^"']*apps\/web/, message: "mobile must not import web-only code" },
  { id: "domain-pure", applies: (rel) => rel.startsWith("packages/domain/"), pattern: /from\s+["'](@prisma\/client|prisma|express|axios|react|next|@supabase\/|node:fs)/, message: "domain must stay pure (no infra imports)" },
  { id: "contracts-pure", applies: (rel) => rel.startsWith("packages/contracts/"), pattern: /from\s+["'](@prisma\/client|prisma|express|axios|react|next|@supabase\/)/, message: "contracts may only depend on zod" },
  { id: "package-no-app", applies: (rel) => rel.startsWith("packages/"), pattern: /from\s+["'][^"']*apps\//, message: "packages must not import apps" },
  { id: "api-supabase-adapter", applies: (rel) => rel.startsWith("apps/api/src/") && !rel.includes("/adapters/") && !rel.includes("/lib/storage"), pattern: /from\s+["']@supabase\/supabase-js/, message: "supabase-js belongs in adapters" },
  { id: "api-ocr-adapter", applies: (rel) => rel.startsWith("apps/api/src/") && !rel.includes("/adapters/"), pattern: /from\s+["']tesseract\.js/, message: "tesseract.js belongs in adapters" },
  { id: "api-process-adapter", applies: (rel) => rel.startsWith("apps/api/src/") && !rel.includes("/adapters/") && !rel.endsWith("index.ts"), pattern: /from\s+["'](node:)?child_process["']/, message: "child_process belongs in adapters" },
];

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      yield* walk(full);
      continue;
    }
    if (/\.(ts|tsx|mjs)$/.test(entry.name)) yield full;
  }
}

const violations = [];
for await (const full of walk(ROOT)) {
  const rel = path.relative(ROOT, full).replaceAll("\\", "/");
  const source = await fs.readFile(full, "utf8");
  for (const rule of RULES) {
    if (!rule.applies(rel)) continue;
    if (!rule.pattern.test(source)) continue;
    const line = source.slice(0, source.search(rule.pattern)).split("\n").length;
    violations.push({ rule: rule.id, file: rel, line, message: rule.message });
  }
}

const byRule = new Map();
for (const violation of violations) byRule.set(violation.rule, (byRule.get(violation.rule) ?? 0) + 1);

if (byRule.size === 0) {
  console.log("arch: clean");
  process.exit(0);
}

console.log(`arch: ${violations.length} violation(s)`);
for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${rule}`);
if (STRICT) {
  for (const violation of violations.slice(0, 40)) console.log(`  ${violation.file}:${violation.line}  ${violation.message}`);
  process.exit(1);
}
console.log("  (non-strict: reported only; use --strict in CI for the target state)");
