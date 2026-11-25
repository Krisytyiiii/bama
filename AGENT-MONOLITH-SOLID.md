# AGENT.md — Zentra monolith + SOLID refactor

> Repo root: `AGENT-MONOLITH-SOLID.md`. Load this file together with `AGENTS.md`
> when the task is the monorepo/SOLID refactor; `AGENTS.md` still wins on
> commands, gotchas and invariants not repeated here. It is written to be
> **executed**, not read: every rule below is a constraint on the agent's diffs,
> and every phase has an exit criterion you can check.

---

## 0. Your role

You are the refactor agent for **Zentra** (E-zentra), a Student Information &
Management System for Mati School of Arts and Trades, Grades 7–12, trimester.
Today it is two sibling folders — `backend/` (Express 4 + Prisma) and
`frontend/` (Next.js 16 App Router) — with no root workspace.

Your job, over the phases in §8:

1. Reshape the repo into **one monolith monorepo** with `apps/web` for the web
   surface and `apps/mobile` for the mobile surface.
2. Apply **every SOLID principle** to the code that moves (§5).
3. Enforce **hard code-quality limits** — phrase-only comments (no blocks), no
   oversized files, strict layering (§6).
4. Leave the product **working identically** at the end of every phase.

You are not a feature agent. If a request would add behaviour, stop and say so.

---

## 1. Mission statement (put this in every plan you write)

> Turn Zentra into a monorepo monolith where `apps/web`, `apps/mobile` and
> `apps/api` are thin composition surfaces over shared `packages/*` (contracts,
> domain, api-client, ui tokens), the backend keeps a strict
> routes → controllers → services → repositories → Prisma layering behind ports
> and adapters, and no source file exceeds the size limits in §6 — with zero
> change to public URLs, DB schema, RLS, realtime behaviour and seeded data.

**Success is measurable, not vibes.** You are done when §9 passes.

---

## 2. Verified ground truth about the current repo

Do not re-scan the repo to relearn this — it was measured:

- Root: `AGENTS.md`, `PLAN.md`, `SYSTEM_UNDERSTANDING.md`, `docs/`, `PLANS/`,
  `supabase/`, `push.bat`. **No root `package.json`, no workspace.**
- `backend/` — Node 22, Express 4, **TypeScript ESM** (relative imports end in
  `.js`), Prisma 7.10 + `@prisma/adapter-pg`, committed generated client at
  `backend/src/generated/prisma/` (pollutes diffs by design), ~288 route
  registrations mounted in `backend/src/app.ts`, 74 migrations + `0001_rls.sql`
  applied by hand (`npx tsx prisma/apply-rls.ts`), Vitest + Supertest.
  Layering today: `modules/<domain>/*.routes.ts` → `*.repository.ts` /
  `services/<domain>.ts` → Prisma, with a shared kernel in `src/lib/`.
- `frontend/` — Next.js 16.3.2, React 19, TanStack Query 5, Axios, Tailwind 4 +
  shadcn, **395 `.module.css` files** (shell/page layout — the current mixed
  convention this refactor removes, see §6.5), Supabase `postgres_changes` per role
  (`src/lib/realtime/*Channel.ts`), desk sounds (`src/lib/notify/deskSounds.ts`,
  `deskCatchUp.ts`). 8 role shells; student/parent log in but have no desk.
- Mobile does **not** exist in this tree. Branches `origin/mobile` and
  `origin/mobileDevice` exist and are UNVERIFIED — treat them as reference
  material only, never as a merge target without inspection.
- Measured worst offenders (lines, excluding generated Prisma):

  | File | Lines |
  |---|---|
  | `backend/src/services/sf10/records.service.ts` | 1688 |
  | `backend/src/services/schedule/schedule.service.ts` | 1604 |
  | `backend/src/modules/risk/interventions.service.ts` | 1247 |
  | `backend/src/services/teacher/overview.service.ts` | 919 |
  | `backend/src/services/sf10/ocr-text.service.ts` | 888 |
  | `backend/src/services/registry/access.service.ts` | 867 |
  | `backend/src/services/sf10/template-file.service.ts` | 796 |
  | `backend/src/services/risk.ts` | 772 |
  | `backend/src/modules/risk/riskBoard.service.ts` | 701 |
  | `backend/src/modules/grades/grades.routes.ts` | 598 |
  | `frontend/src/app/teacher/advisory/list/page.tsx` | 1632 |
  | `frontend/src/components/registry/sf10/Sf10DetailView.tsx` | 1398 |
  | `frontend/src/app/teacher/chat/components/BamaThread.tsx` | 1125 |
  | `frontend/src/components/session-booking/BookSessionDialog.tsx` | 1163 |
  | `frontend/src/app/teacher/classes/components/MyClasses.tsx` | 1047 |

  These are the Phase 3 / Phase 4 targets, in that order.

---

## 3. Target architecture

### 3.1 Shape

```
zentra/                        # monorepo root (npm workspaces; pnpm optional, ask first)
├─ apps/
│  ├─ web/                     # was frontend/  — Next.js 16 App Router (all 8 role shells)
│  ├─ api/                     # was backend/   — Express 4 REST, the single server both clients call
│  └─ mobile/                  # NEW           — Expo + React Native, thin client
├─ packages/
│  ├─ contracts/               # zod schemas + DTO types + route constants (single source of truth)
│  ├─ domain/                  # PURE business rules: transmutation, risk factors, term math, pagination
│  ├─ api-client/              # typed Axios client, token/refresh single-flight, error mapping
│  ├─ ui-tokens/               # design tokens: colour scale, spacing, radii, motion durations, type scale
│  ├─ config/                  # tsconfig bases, eslint bases, prettier, tsconfig paths
│  └─ testing/                 # fixtures + test helpers shared by apps
├─ docs/                       # keep; add docs/architecture/decisions/*.md here
├─ supabase/                   # keep at root (infra, not an app)
├─ tools/                      # repo-metrics.mjs, arch-check.mjs, route-inventory.mjs
├─ docker-compose.yml          # api + web on one network, one public origin (§3.4)
├─ package.json                # orchestration scripts only (`npm --prefix`, no deps)
```

Root `package.json` deliberately has **no `workspaces` field and no dependencies**
in P1: each app keeps its own lockfile and `node_modules`, so the directory move
stays verifiably behaviour-neutral. Hoisting to real npm workspaces is ADR-0002,
deferred to P6.

### 3.2 Dependency rule (this is the architecture; enforce it mechanically)

```
apps/web   ──▶ packages/{contracts, api-client, domain, ui-tokens}
apps/mobile──▶ packages/{contracts, api-client, domain, ui-tokens}
apps/api   ──▶ packages/{contracts, domain}          (+ prisma, own adapters)
packages/api-client ──▶ packages/contracts
packages/domain     ──▶ packages/contracts (types only)
packages/contracts  ──▶ (zod only — no prisma, no express, no react, no axios)
```

Forbidden, always:

- `packages/*` importing from `apps/*` (any direction of app-to-package is fine;
  the reverse is never).
- `packages/domain` importing `@prisma/client`, `pg`, `express`, `axios`,
  `react`, `next`, `@supabase/*`, or `node:fs`.
- `apps/web` importing Prisma, `apps/api/src/**`, or any backend service.
- `apps/mobile` importing `next`, `react-dom`, `apps/web/**`, or DOM APIs.
- Any file importing a deep path into another package (`packages/x/src/internal/…`)
  — only the package's public entrypoint.

### 3.3 Why `apps/api` stays a separate app in a "monolith"

A monolith means **one deployable product and one database**, not one process.
Splitting the Express API out of the process is Phase 7 and is **optional**.
Recommended default: keep `apps/api` as the single server for web + mobile.

If the owner insists on a single Next process (API folded into
`apps/web/app/api/**/route.ts`): that is a rewrite of ~288 route registrations
into Route Handlers, and it forces every `express` middleware (rate limit,
helmet, term scope, cache, ETag, upload, error mapping) to be re-expressed in
Next conventions. Do **not** start it without an explicit written go-ahead; the
plan is in §8 P7 with its cost list.

Hard reasons it stays a process of its own (do not re-litigate these per PR):

| Constraint | Why Next Route Handlers can't absorb it cleanly |
|---|---|
| Hourly sweeps in `apps/api/src/index.ts` (auto-absent, risk snapshots, grade-flag escalation) | Needs a long-lived timer; serverless handlers don't keep one |
| LibreOffice SF10 PDF conversion, one conversion at a time, throwaway profile dir, `SF10_SOFFICE_PATH` | Needs a warm binary + a queue; already works in the Docker image |
| `tesseract.js` SF10 OCR with worker lifecycle | Cold-start and memory hostile in a handler runtime |
| Uploads (multer), streaming, `helmet`, `express-rate-limit`, ETag, cache middleware, term-scope middleware | All already composed in one `app.ts`; each would need a Next re-expression |
| ~288 route registrations and their guards (`requireAuth`/`requireRole`/`gradeBandGuard`) | Rewrite surface, zero product gain |

### 3.4 One product, one URL, two processes (recommended packaging)

Users and clients must never see "two apps". Do this in P1, not P7:

- **One public origin.** `https://zentra.edu/api/*` → `apps/api`; everything else
  → `apps/web`. Implement with Next `rewrites` in `apps/web/next.config.ts`
  (`/api/:path*` → `API_ORIGIN/api/:path*`) for dev/preview, and a reverse proxy
  (nginx/Caddy) or platform routing rule in production. `NEXT_PUBLIC_API_BASE_URL`
  becomes same-origin `/api`, so no CORS in production and no absolute URLs baked
  into the client bundle.
- **One command to run everything.** Root `npm run dev` starts api + web (and
  mobile when asked) via `concurrently`-style scripts or npm workspaces
  `--workspace` fan-out; root `docker-compose.yml` with `api` + `web` services on
  one network, `api` unreachable from outside except through `web`'s proxy.
- **One contract boundary.** Web and mobile both point at the same origin; only
  `packages/api-client` knows the base URL shape.
- **Cookies stay same-origin.** The refresh cookie (`httpOnly`) must be issued by
  the origin the browser talks to. If the proxy terminates `/api`, set the cookie
  domain/path at the proxy-facing host, and keep `SameSite`/`Secure` behaviour
  identical to today. Verify with a real login + refresh cycle before closing P1.
- **Migrate the API later only if a real problem appears** (cost, cold ops, team
  split). If it ever happens, §8 P7 stays the plan, and the move is per domain
  behind the same origin so clients never notice.

---

## 4. Invariants — never regress these while moving code

Each of these is a documented behaviour in `AGENTS.md`. They are the trip-wires
of this refactor. If a change touches one, write the before/after in your report.

1. **Public API surface**: ~288 route registrations, same paths, same methods,
   same request/response envelopes `{data,total,page,pageSize,totalPages}`.
   Moving a file must not rename an endpoint.
2. **Pagination**: 15/page everywhere; max 15; the two 16/page exceptions
   (nurse referral queues, guidance interventions queue). Never raise the global cap.
3. **Term scope**: only term-steering roles (`subject_teacher`, `adviser`,
   `principal`, `admin`) may pass `?termId`/`?schoolYearId`/`x-term-id`;
   everyone else resolves server-side. Memoized 30s — any code path that creates
   or activates a term/year must call `invalidateTermScopeCache()`.
4. **Caching**: every Redis call goes through `redisOp` (hard timeout). New cache
   read/write sites must use `lib/cache.ts` + `lib/cacheTags.ts`, never the raw
   client. `x-zentra-fresh: 1` skips reads.
5. **Realtime**: `lib/realtime/*Channel.ts` must still be wired in all 8 shells
   (7 staff + admin). Never attach a `postgres_changes` filter on a camelCase
   column. `realtime.setAuth(token)` before `.subscribe()`. Do not remove tables
   from the Supabase publication; publication membership is not in a schema diff.
6. **RLS**: `0001_rls.sql` + the `zentra_advises_*` SECURITY DEFINER helpers stay
   in sync with any schema-visible change; application stays manual.
7. **Auth**: access JWT in `localStorage` (`zentra.access`) + refresh httpOnly
   cookie, single-flight refresh on 401, argon2id, `requireAuth`/
   `requireRole`/`requireOwnershipOrRole`, `gradeBandGuard`. Admin is never
   accepted by the staff portal.
8. **Writes**: `writeAudit` (pass the tx client inside a transaction),
   `fanoutNotification` (types only via `TYPE_MAP`), `invalidateTags([...])`,
   live risk recompute, `invalidateInterventionCaches()` +
   `bumpRiskCohortVersion()` on any intervention write.
9. **ADM attendance exemption**: the principal signature is the switch; signed
   ADM learners are exempt from seat-time, risk suppresses only the attendance
   factor, both attendance submit endpoints return `409 ADM_EXEMPT_LEARNER`,
   grading uses `Assessment.audience` pools.
10. **One live referral per learner per type** (`409 REFERRAL_ALREADY_OPEN`).
11. **Anecdotal reads always filter `deletedAt: null`** — including counts and
    nested relation filters.
12. **Teacher desk**: every query in `app/teacher/**` is live (`useLiveQuery`,
    `useLiveQueries`, or `liveQueryOptions`); no bare `useQuery` panels.
13. **Desk sounds + nav dots**: classifier functions, catch-up, priming list and
    seen-map keys (`zentra.*.seen.*`, `zentra.*.rung.*`) keep their names and
    semantics — they are persisted in browsers.
14. **UI contract**: buttons 32px, min type size 12px, Inter everywhere, one
    accent, glass dock on every desk, `components/nav/sidebar-icons.ts` for nav
    icons, `lib/labels/status-tone.ts` for status colours.
15. **Build mechanics**: backend ESM `.js` specifiers; committed Prisma client
    regenerated after schema edits; migrations applied by hand (CI must not
    `migrate deploy`).
16. **Data**: no schema change, no column rename, no seed rewrites as part of
    the move. Schema changes need their own approved phase.

---

## 5. SOLID work order

Work the five principles **in this order**, and inside each principle finish all
of its findings before starting the next. Record each finding as
`file:line → pattern → refactor → verification` in `docs/architecture/decisions/`.

### 5.1 Single Responsibility (SRP)

**What you are looking for:** a file/class/function with more than one reason to
change — I/O + rules + formatting + persistence + orchestration in one body.

Known violations to split first:

| Target | Today it does | Split into |
|---|---|---|
| `services/sf10/records.service.ts` (1688) | upload, OCR hand-off, storage, versioning, autofill merge, generated-file render, access checks | `sf10/upload.usecase.ts`, `sf10/versioning.usecase.ts`, `sf10/autofill.usecase.ts`, `sf10/render.usecase.ts`, `sf10/access.policy.ts`, `sf10/records.repository.ts`, `adapters/{ocr,file-store,spreadsheet}.adapter.ts` |
| `services/schedule/schedule.service.ts` (1604) | school-day config, conflict detection, grid CRUD, publish, template copy | `schedule/config.service.ts`, `schedule/conflicts.service.ts` (pure), `schedule/grid.repository.ts`, `schedule/publish.usecase.ts`, `schedule/template.usecase.ts` |
| `modules/risk/interventions.service.ts` (1247) | live cohort scan, memoization, plan assembly, session detail | `risk/cohort.scan.ts` (pure), `risk/cohort.cache.ts`, `interventions/plan.usecase.ts`, `interventions.repository.ts` |
| `services/teacher/overview.service.ts` (919) | 6+ unrelated widgets in one response | one use case per widget + a thin composer |
| `services/sf10/ocr-text.service.ts` (888) | tesseract lifecycle + text parsing + field extraction | `adapters/ocr.adapter.ts` + `sf10/parse.fields.ts` (pure, unit-tested) |
| `modules/grades/grades.routes.ts` (598) | routing + grading math + scope checks | routes ≤150 lines; math into `services/grading/*` (pure) |
| `app/teacher/advisory/list/page.tsx` (1632) | fetch + filters + card + modal + export | `page.tsx` (compose only), `useAdvisoryList.ts`, `components/AdvisoryListGrid.tsx`, `components/AdvisoryFilters.tsx`, `components/AdvisoryLearnerSheet.tsx` |
| `components/registry/sf10/Sf10DetailView.tsx` (1398) | fetch + tabs + forms + print | `Sf10DetailView.tsx` shell + one component per tab + `useSf10Record()` |
| `components/session-booking/BookSessionDialog.tsx` (1163) | form state + conflicts + submit + calendar | `useSessionBooking()`, `SessionSlotPicker`, `SessionForm`, `SessionConflictNotice` |

**Rule of thumb you must apply:** a file may contain **one** of: (a) HTTP
plumbing, (b) pure rules, (c) persistence queries, (d) presentation. Never two.
A function may contain **one** verb.

**Also split these cross-cutting offenders:**

- `lib/notify.ts` — `TYPE_MAP` (type derivation) + fan-out (DB writes) + text
  templates. → `notifications/type-map.ts`, `notifications/templates.ts`,
  `notifications/fanout.service.ts`.
- `lib/cache.ts` / `lib/cacheTags.ts` / `lib/etag.ts` / `lib/redis.ts` — cache
  policy vs. transport vs. tag vocabulary. Keep `redisOp` transport-only.
- `lib/change`-style grab bags: any `lib/*.ts` over 200 lines must be split by
  responsibility before the phase closes.
- Frontend `lib/notify/deskSounds.ts` (836) — clip registry vs. playback bus vs.
  policy. Split into `sounds/clips.ts`, `sounds/bus.ts`, `sounds/policy.ts`.

**Acceptance:** no file over the §6 caps in the touched domain, each new file's
name states its single responsibility, and every extracted pure function has at
least one Vitest covering it.

### 5.2 Open/Closed (OCP)

**What you are looking for:** `switch (type)` / long `if/else` chains where a new
variant means editing an existing function.

Known chains and the registry that replaces each:

1. `lib/notify.ts` `source_table:action` → notification type → replace the map
   with a `Map<string, NotificationRule>` keyed by `source:action`, where each
   rule owns `{ type, title, body, audience }`. Adding a table = adding a rule
   file, no edits to the dispatcher.
2. Desk-sound classifiers (`isAdviserAdmBooked`, `isAdviserAdmRescheduled`,
   `isAdviserReferralEndorsed`, `isAdviserAdmRejected`, the four clinic mirrors,
   `isAdviserSf10Granted*`, `isAdviserSf10Missing*`, `isReferralCancelled`,
   `isAdvisorySession*`) — replace the cascade with an **ordered array of
   `{ id, clip, match(n): boolean, role }`** descriptors per desk. Order matters
   (clinic classifiers before guidance counterparts; registrar before generic)
   — encode it as array position, cover it with a table-driven test.
3. `lib/labels/status-tone.ts` and every `Badge` variant map — one registry of
   `status → { tone, label }`; unknown statuses fall back, never throw.
4. Role branching (`switch (role)` in `lib/roles.ts`, `termScope.ts`,
   nav-counts, `sessionActors.ts`) — a `Record<Role, RolePolicy>` with
   `{ canSteerTerm, canGrade, deskScope, seesBand }`.
5. Registry desks (`record-keeper` vs `registrar`) — the `desk` prop must stay a
   config object (`{ key, band, queryKeys, fetcher, links }`), never a new
   `if (desk === …)` branch in shared components.
6. `lib/grades.ts` transmutation tables — data-driven lookup, no `if` ladders.

**Rule:** adding a new variant of an existing concept must require **adding a
file/entry only**. If it requires editing a conditional, the refactor is not done.

### 5.3 Liskov Substitution (LSP)

**What you are looking for:** two implementations of the same idea that diverge in
contract — different return shapes, extra thrown errors, silently different
semantics. This repo is full of "mirror" code where the mirrors drifted.

Audit list:

- `record-keeper/*` vs `registrar/*` services and `services/registry/**` — same
  desk contract? Align on one `RegistryDeskPort` interface and make both satisfy
  it; band is data, not behaviour.
- `assertAdviserSf10Access` (backend) vs `hasGrant` (autofill service) — both
  must answer the same question for the same inputs. Add a shared test matrix
  (LRN grant, whole-request grant, roster fallback, no profile) run against both.
- Notification channel classes (`*Channel.ts`, 8 of them) — every channel must
  expose the same `{ subscribe, invalidate, teardown }` shape and must be safe to
  mount twice. Extract a `RealtimeChannel` factory + per-role descriptor.
- Repository method pairs used through a shared interface must return the same
  envelope, throw the same `AppError` codes, and never throw raw Prisma errors
  (mapping belongs in `lib/errors.ts`).
- Any `None | NotImplemented` stub: delete it or implement it. A port whose
  implementation throws `not implemented` is an LSP violation, not a placeholder.
- Frontend `usePaginatedQuery` consumers that pass a fetcher returning a bare
  array — that breaks the base contract. Normalise in the fetcher, not the hook.

**Acceptance:** every port has ≥2 implementations exercised by one shared
contract test, or exactly one implementation and a documented reason.

### 5.4 Interface Segregation (ISP)

**What you are looking for:** fat prop bags / option objects / return types that
force consumers to know fields they never read.

Audit list:

- `schedule-calendar-page.tsx` config (shared by guidance + nurse) — split into
  `CalendarSource` (fetch + query key) and `CalendarViewLabels` (titles, rail
  tracks). A desk that doesn't show ADM meetings must not receive the field.
- Registry overview widgets (`RegistryAttentionDeck`, `RegistryGradePanel`,
  `RegistryRequestsPanel`, `RegistryRecordsLedger`) — that is the right pattern:
  keep it, and make every prop **required**; no optional soup.
- Table/list row types with 20+ fields where the consumer uses 4 — define
  projection types (`LearnerIdentityRow`, `ReferralCardRow`) at the fetcher and
  select only those columns in Prisma. Big `getStudents` payloads are the usual
  suspects.
- Service-hook return types that leak the whole TanStack result — return the
  narrow shape pages need.
- `usePaginatedQuery` options — keep the smallest option set; anything
  role-specific goes in the hook wrapper, not the shared signature.

**Rule:** if a prop/option is only meaningful for one caller, it belongs in that
caller's wrapper type. No `Partial<X>` and no `?` on structural props.

### 5.5 Dependency Inversion (DIP)

**What you are looking for:** high-level rules importing concrete infrastructure.

Ports to introduce in `apps/api/src/ports/` (interfaces only, no imports from
`prisma`/`@supabase`/`express`/`tesseract`/`child_process`):

```ts
export interface Clock { now(): Date }
export interface CachePort { get<T>(k: string): Promise<T | null>; set(...): Promise<void>; del(...): Promise<void> }
export interface FileStorePort { put(key: string, buf: Buffer, mime: string): Promise<{ url: string }> }
export interface OcrPort { text(image: Buffer): Promise<string> }
export interface SpreadsheetPort { toPdf(xlsx: Buffer): Promise<Buffer> }
export interface NotifierPort { fanout(tx: Tx, n: NotificationDraft[]): Promise<void> }
export interface AuditPort { write(tx: Tx, e: AuditEntry): Promise<void> }
```

Adapters in `apps/api/src/adapters/`:

- `prisma/*.repository.ts` implements repository ports per aggregate
  (`LearnerRepository`, `ReferralRepository`, `Sf10Repository`, `GradeRepository`,
  `ScheduleRepository`, `NotificationRepository`, `AuditRepository`).
- `supabase/file-store.adapter.ts` wraps `lib/storage.ts` (`supabase-js` touches
  exactly one file in the whole backend).
- `tesseract/ocr.adapter.ts` wraps `services/sf10/ocr-text.service.ts`'s engine
  lifecycle; parsing stays pure in `packages/domain`.
- `libreoffice/spreadsheet.adapter.ts` wraps `xlsx-to-pdf.service.ts`
  (`soffice` spawn + temp profile lives here and nowhere else).
- `redis/cache.adapter.ts` wraps `redisOp`; `upstash` is imported only there.
- Services receive ports through a composition root (`apps/api/src/container.ts`),
  never import a concrete adapter, and never import `prisma` directly. Route
  handlers reach the container; nothing else does.

Frontend equivalents:

- `packages/api-client` is the only place `axios` is imported. `apps/web/src/lib/api/client.ts`
  becomes a re-export of the shared client + web-specific term headers.
- Supabase realtime is behind `RealtimePort` (`subscribe(table, cb, scope)`), with
  `@supabase/supabase-js` imported in exactly one adapter file.
- Audio playback behind `SoundPort` (`prime`, `play`, `unlock`); index-based
  `Audio` objects never leak into components.
- No component imports `localStorage`/`window` directly — `StoragePort` /
  `useBrowserStorage` wrapper, so `apps/mobile` can substitute SecureStore/AsyncStorage.

**Acceptance:** `grep -rn "from \"@prisma/client\"\|from \"prisma\"\|supabase-js\|tesseract\|child_process" apps/api/src` returns hits **only** under `src/adapters/`, `src/lib/prisma*.ts` and `prisma/`. Same test on the frontend for `axios`, `@supabase`, and `window.localStorage`.

---

## 6. Code-quality rules (hard, enforced in CI)

### 6.1 Comments — phrase only, never blocks

Comments are **allowed**, but only as a **single-line phrase** (`//`) directly
above the line it explains. One idea, one sentence, no paragraphs.

Allowed:

```ts
// Realtime lowercases the filter identifier, so this binding must stay RLS-scoped.
const channel = supabase.channel("notification_own")

// One conversion at a time: LibreOffice locks its profile directory.
await spreadsheet.toPdf(workbook)
```

Banned outright — delete on sight, in every file you touch:

- block comments of any kind: `/* … */`, `/** … */`, JSDoc `@param`/`@returns`
- banner and divider comments (`/* ---- Section ---- */`, `//////`, `#region`)
- multi-line why-explanations (a 3-line comment is a paragraph — see below)
- commented-out code, commented `console.log`, `// TODO`/`// FIXME` narration
- changelog notes, author tags, "what this does" restatements of the signature
- prose above a function describing its steps; the function name and its parts
  must carry that

Rules of thumb:

1. If the explanation needs more than one line, it is a paragraph: move it to
   `docs/architecture/decisions/ADR-*.md` and leave at most one phrase pointing
   at it (`// see ADR-0007`).
2. If the comment restates the code, delete it. If the code is unclear without
   it, rename the code so it isn't.
3. `why:` prefix is optional; use it when the comment corrects an instinct
   (`// why: ...`). Never write `what:` comments.
4. Comments describe **constraints and causes**, not mechanics.

Budget (`tools/arch-check.mjs` enforces):

- `//`-comment lines ≤ **5%** of a file's lines
- never more than **2 consecutive** comment lines
- zero block comments (`/*`) outside the allowlist (generated Prisma, migration
  SQL, `(print)` sheets)

> `AGENTS.md` says "comments explain why" — this section is that rule, tightened
> to phrases and enforced. Do not delete why-comments; convert any that are
> blocks or paragraphs.

### 6.2 Size limits

| Unit | Soft warn | Hard fail |
|---|---|---|
| Any `.ts` / `.tsx` source file | 200 | **250** |
| Route/handler file | 120 | **150** |
| Service or repository file | 180 | **220** |
| React component file | 150 | **200** |
| Function / method | 30 | **45** |
| Function params (excluding `tx`) | 3 | **5** |
| Nesting depth | 2 | **3** |
| Exports per file | 5 | **8** |
| CSS module | **0 — banned** |
| `globals.css` (Tailwind base layer + tokens only) | 400 | **500** |

Exemptions (allow-listed, never expanded without approval):
`prisma/schema.prisma`, `src/generated/prisma/**`, `packages/contracts/**` schema
aggregators, `(print)` A4 record sheets, migration SQL, seed scripts.

Enforcement: `tools/arch-check.mjs` walks the tree, honours an explicit
`allowlist.json` (path + reason + owner + expiry date), and exits non-zero. Add
to CI and to `npm run check:arch`.

### 6.3 Naming & structure

- One exported symbol per file when the file is a class/service; file name =
  kebab-case of the primary export (`sf10-upload.usecase.ts`).
- Suffixes carry the role: `.routes.ts`, `.controller.ts`, `.service.ts`,
  `.usecase.ts`, `.repository.ts`, `.policy.ts` (pure rules), `.adapter.ts`
  (infrastructure), `.port.ts` (interface), `.schemas.ts` (zod), `.types.ts`
  (types only), `.test.ts`.
- No `index.ts` barrels except a package's single public entrypoint.
- No default exports in backend. Frontend page/route files are the only default
  exports.
- No barrel re-export that crosses a layer (a `services/index.ts` re-exporting
  repositories is a layering violation).
- Backend folders: `modules/<domain>/{routes,controller,service,usecase,repository,schemas,policy}`,
  `adapters/<impl>`, `ports`, `lib/` (kernel: no domain logic), `container.ts`
  (composition root only).
- Every module's public surface is its routes file; other modules must not import
  another module's repository. Cross-domain work goes through the other module's
  service or `packages/domain`.

### 6.4 Frontend structure after the move

```
apps/web/src/
├─ app/(shells)/{admin,coordinator,guidance,nurse,principal,record-keeper,registrar,teacher}/…
├─ app/(print)/…
├─ components/{ui,shared,registry,risk-dashboard,session-booking,dock}/
├─ features/<domain>/{components,hooks,api}/
├─ lib/{api,auth,realtime,notify,term,labels,styles}/
└─ styles/globals.css
```

Rule: a page file composes; it does not fetch-and-render-everything. Fetching
lives in `features/<domain>/api` or `services/<role>`, presentation in
`components`, state in `hooks`. Any page over 200 lines is a finding.

### 6.5 Styling — Tailwind only, no CSS Modules

**No `.module.css` file may exist in `apps/web` when this refactor closes.** All
styling is Tailwind utilities + tokens.

- New or touched UI: Tailwind utilities on `className`, `clsx`/`cva` for variants.
  Never `styles.foo`, never `import styles from "./x.module.css"`.
- `globals.css` keeps only the Tailwind import (`@import "tailwindcss"`), theme
  tokens (`@theme`), reset/base layers, and the handful of global rules that
  genuinely cannot be a utility (`[data-slot="button"]` height enforcement, print
  `@page`). No component selectors, no layout classes.
- Design values come from `packages/ui-tokens` mapped into the Tailwind theme
  (`--color-*`, `--spacing-*`, `--radius-*`, `--duration-*`). Hard-coded hex,
  px font sizes, and ad-hoc breakpoints are findings.
- Recurring patterns (glass dock, card shell, table chrome, pill) become
  `cva` variants in `components/ui`, not stylesheets.
- Long utility strings are composed with `cn()` and extracted to a component
  variant map, not to a CSS class.
- Exceptions, allow-listed: `(print)` A4 record sheets, `.sf10-print` styles
  needed by the server-generated PDF path, and animation keyframes that Tailwind
  cannot express (declared once in `globals.css` with `@keyframes`).
- Migration is **P4**, not P1: 395 `.module.css` files exist today. Convert file
  by file alongside the SOLID split of that page, and record the remaining count
  in every phase report until it reaches 0. `tools/repo-metrics.mjs` already
  fails on any `css-module` entry.

---

## 7. Enforcement tooling to add (Phase 6)

1. `tools/repo-metrics.mjs` — counts files over the §6.2 caps, total lines by
   area, `//` comment ratio and block-comment count, and writes
   `docs/architecture/metrics.json`. Run before/after
   every phase; the diff goes in the report.
2. `tools/arch-check.mjs` — ESLint `import/no-restricted-paths` (or
   `eslint-plugin-boundaries`) for the §3.2 matrix, the §6.2 size caps, and the
   §6.1 comment rules (block comments, >2 consecutive comment lines, ratio cap).
3. `tools/route-inventory.mjs` — greps `app.ts` + `*.routes.ts` for method+path
   pairs, diffs against `docs/architecture/api-inventory.json`. Any diff must be
   explained in the report; the refactor target is **zero diff**.
4. `packages/contracts` parity test — for each moved zod schema, a test asserting
   the parsed shape matches the response keys the web client reads.
5. CI (` .github/workflows/ci.yml`): add `npm run check:arch`, `npm run metrics`,
   `npm run check:routes`. Keep the existing steps (backend prisma generate →
   typecheck → test → build; frontend tsc → lint → build). **Do not add
   `prisma migrate deploy`.**
6. New root scripts: `dev` (all), `dev:web`, `dev:api`, `dev:mobile`, `typecheck`,
   `test`, `build`, `check:arch`, `metrics`, `check:routes`, plus a root
   `docker-compose.yml` (§3.4).

---

## 8. Phases (do not skip, do not merge)

Each phase ends with: all app builds green, route inventory diff empty, metric
diff reported, and a commit series using the phase prefix.

### P0 — Baseline (no code moves)
- **Prerequisite: git.** This checkout (`msat-zentra-copy`) has **no `.git`** —
  every later phase needs history for `git mv`, diffs and rollback. Run the
  refactor in the real repository (`msat-zentra/`, which has `.git`), or
  `git init` here and make one baseline commit of the current tree before
  touching a file. Verify with `git rev-parse --is-inside-work-tree`.
- Write `tools/repo-metrics.mjs`, `tools/route-inventory.mjs`; generate
  `docs/architecture/api-inventory.json` and `metrics.json` from the current tree.
- Record the current test results (`backend npm test`, typecheck, builds) — this
  is the only acceptable baseline.
- **Exit:** repo is a clean working tree with a baseline commit; inventory +
  metrics committed; you can quote "before" numbers.

### P1 — Monorepo skeleton (pure moves, zero logic edits)
- Root `package.json` with npm workspaces (`apps/*`, `packages/*`), no new runtime
  deps. Ask before choosing pnpm/turborepo.
- `git mv frontend apps/web` and `git mv backend apps/api`; fix `.gitignore`,
  `.github/workflows/*`, `push.bat`, `Dockerfile` paths (`apps/api/Dockerfile`),
  `.env.example` locations, and any script referencing `../backend`.
- `packages/config` with tsconfig bases (backend ESM/NodeNext, web bundler,
  mobile metro) and eslint bases. Every app extends a base. No duplicated compiler options.
- Keep both apps runnable: `npm run dev:api`, `npm run dev:web`.
- **Package them as one product (§3.4):** add the `/api/:path*` rewrite in
  `apps/web/next.config.ts`, point `NEXT_PUBLIC_API_BASE_URL` at same-origin
  `/api`, add root `npm run dev` (api + web together) and a root
  `docker-compose.yml` with `api` + `web` (api only reachable through `web`'s proxy).
- **Verify the cookie across the proxy:** full login → refresh → logout cycle on
  the proxied origin, with the httpOnly refresh cookie still `Secure`/`SameSite`
  as today. A wrong cookie domain here breaks every desk silently.
- **Exit:** `npx tsc --noEmit` in both apps, `npm test` in api, `npm run build` in
  both, `npm run dev` boots the whole product from one command, and one manual
  smoke of login (through the proxy) + one desk page + one API call + a token
  refresh after the access token expires.

### P2 — Shared packages (no behaviour change)
- **Wiring decision (P2, proven on `@zentra/domain`):** each package compiles to
  `dist` with its own `tsconfig`; apps consume it via a `file:` dependency
  (`npm install ../../packages/domain` → junction in `node_modules`), so the
  package must be built before the app typechecks. Root scripts encode the order
  (`build:packages` → `build:api`/`build:web`), CI builds packages first. This is
  ADR-0002's "no workspaces yet" applied per package; hoisting stays a P6 change.
- `packages/contracts`: move every `*.schemas.ts` zod schema, DTO type and route
  path constant out of the API; API re-imports from the package (delete duplicates,
  do not copy). Done in one slice: 16 schema modules + `pagination` +
  `MASCOT_CHARACTERS` + `ADM_STAGES` live in `packages/contracts/src`, each
  `apps/api/src/modules/**/*.schemas.ts` is a one-line `export * from
  "@zentra/contracts/<name>"`, and `apps/web` imports the same mascot list. Subpath
  exports (`./*.js` and `./*`) exist so both NodeNext and Turbopack resolve it.
  Contracts keep zod 3 to match the API — bumping zod is a separate, app-wide
  change.
- `packages/domain`: extract pure functions with **teeth**: DepEd transmutation
  (`lib/grades.ts`), risk factor computation (`computeRiskFactors` core, minus
  I/O), term resolution math, attendance rate helpers, pagination envelope
  builder, LRN normalisation/match, slug ↔ case-name sync. Each gets a Vitest
  file moved alongside it. Domain must not import Prisma types — map to plain DTOs.
- `packages/api-client`: Axios instance + interceptors + refresh single-flight +
  `AppError` mapping + `x-zentra-fresh` behaviour; web's `lib/api/client.ts`
  becomes a thin wrapper adding term headers. Shipped as `createApiClient(ports)`
  — token storage, desk headers, session-expired redirect and logout cleanup are
  injected by the app, so the package holds no `window`/localStorage assumptions
  and mobile can reuse it. Done: `apps/web/src/lib/api/client.ts` is now the
  browser adapter (localStorage token, term + fresh headers, `/errors/403`) and
  keeps its old exports, so all ~90 importing modules were untouched.
- **Turbopack root (P2, required):** Turbopack refuses to resolve files outside
  its detected root, and packages live two levels up. `apps/web/next.config.ts`
  sets `turbopack.root` to the repo root; without it `next build` fails with
  `Module not found: Can't resolve '@zentra/contracts/mascot'` while `tsc`
  passes (tsc follows the junction, Turbopack does not).
- `packages/ui-tokens`: colour/spacing/radius/motion/type-scale constants consumed
  by Tailwind config, CSS modules and (later) React Native StyleSheet. Web design
  rules (32px buttons, 12px min type, Inter, one accent) become token values, not
  literals.
- Build strategy decision (ask, then document in an ADR): **A** tsconfig project
  references + `dist` output (recommended for `apps/api` NodeNext correctness), or
  **B** `tsconfig` path mapping to package `src` (faster DX, riskier for ESM).
  Whichever is chosen, be consistent everywhere.
- **Exit:** contracts imported by both web and api from one place; domain tests
  green in isolation (`npx vitest -c packages/domain`); no duplicated schema file
  anywhere (`grep` proof in the report).

### P3 — Backend SOLID (largest phase; do it domain by domain)
Order: `notify`/`audit`/`cache` kernel → `risk` → `grades` → `sf10` → `schedule`
→ `referrals`/`interventions` → `registry` (record-keeper + registrar) →
`teacher` → `adm` → remaining. For each domain:

1. Split files per §5.1; introduce repository + ports per §5.5.
2. Replace chains per §5.2 with registries; add the table-driven tests.
3. Route files ≤150 lines: parse (zod) → call service → map response. Nothing else.
4. `writeAudit`, `fanoutNotification`, cache invalidation and risk-recompute calls
   are preserved exactly — verify with a grep diff per domain (same call count,
   same ordering inside transactions).
5. Delete dead code you uncover; never delete a route, a notification type, a
   sound classifier, or a nav-count key.

**Exit:** zero backend files over caps in the touched domains, no `prisma` import
outside `adapters/`+`lib/prisma*`, `npm test` green, route inventory diff empty.

### P4 — Frontend SOLID
Split the giant pages/components (§5.1 rows 7–9), introduce the feature folder
convention (§6.4), extract the sound/realtime/storage ports (§5.5), convert prop
bags to required narrow types (§5.4), and align the two registry desks on one
descriptor (§5.3). Keep every `zentra.*` localStorage key and every clip path
byte-identical.

**Also the Tailwind migration (§6.5)** — the largest single frontend task: 395
`.module.css` files today. Convert them page-by-page as each page is split, in
this order: shared `components/**` first (highest reuse), then shells
(`app/<shell>/layout`), then feature pages, then the print sheets last. Each
conversion: move values into `packages/ui-tokens`, express the rules as utilities
/ `cva` variants, delete the module file and its import, visually diff the page.
Track the remaining count in every report.

**Exit:** `npx tsc --noEmit -p apps/web/tsconfig.json`, `npm run lint`,
`npm run build`, `node tools/repo-metrics.mjs --fail` with **zero `css-module`
entries** and zero `*.module.css` imports left; a manual pass over: one teacher
desk, one guidance desk, one registry desk, admin overview, login catch-up sound,
nav dots, and one print record sheet.

### P5 — `apps/mobile` (new surface, thin by construction)
- Expo (managed) + React Native + TypeScript, consuming
  `packages/{contracts,api-client,domain,ui-tokens}` only.
- Auth: same `/api/auth/*` endpoints; refresh token in `expo-secure-store`, access
  token in memory + SecureStore; single-flight refresh reused from `api-client`.
- Start with read-first surfaces that already exist server-side: student/parent
  (today they land on 404 — this is the first real home for them), plus teacher
  read-only (my classes, advisory list, notifications).
- No realtime fan-out on day one — poll with the same 20s/5s cadences and
  TanStack Query; add `RealtimePort` later via `supabase-js` RN transport.
- No web imports: no `next`, no `react-dom`, no CSS modules. Styling from
  `packages/ui-tokens` + RN `StyleSheet`.
- Inspect `origin/mobile` / `origin/mobileDevice` for salvageable screens before
  writing new ones; report what you found and what you kept.
- **Exit:** mobile boots in Expo Go, logs in against the dev API, shows one real
  list + one detail screen from live data; api-client shared with web (proof: one
  file, two importers).

### P6 — Enforcement + docs
Add §7 tooling, wire CI, rewrite `AGENTS.md` §3/§4/§5 for the new paths, write
ADRs for: monorepo layout, package build strategy, ports/adapters map, comments
policy, mobile scope. Update `SYSTEM_UNDERSTANDING.md` path references.

**Exit:** `npm run check:arch` + `check:routes` + `metrics` green in CI.

### P7 — OPTIONAL: fold the API into `apps/web`
Only with explicit written approval, and only if §3.4's single origin proves
insufficient in practice. Cost list to state first: 288 routes → Route Handlers,
re-express helmet/rate-limit/upload/ETag/term-scope/cache middleware, move the
hourly sweeps and the LibreOffice/OCR pipelines out of request handlers, change
the Docker image, lose the "two processes, one DB" rollback. If approved: move by
domain, one module per PR, dual-run both servers behind the existing single
origin (no client changes), then cut over.

---

## 9. Definition of Done (final gate)

1. `apps/{web,api,mobile}` + `packages/{contracts,domain,api-client,ui-tokens,config,testing}` exist; root has one `package.json` with workspaces, one `npm run dev`, and one `docker-compose.yml`.
2. One public origin serves the product: `/api/*` → `apps/api`, everything else → `apps/web`, with the refresh cookie intact (§3.4).
2. Dependency matrix from §3.2 holds mechanically (`check:arch` green) — no app↔app imports, no package→app imports, no Prisma/react/next/axios in the wrong layer.
3. `docs/architecture/api-inventory.json` diff vs. P0 is **empty** (same paths, methods, envelopes).
4. `metrics.json`: 0 files over hard caps outside the allowlist; `//` comment
   ratio ≤5%; zero block comments outside the allowlist; **zero `css-module`
   entries** (no `.module.css` anywhere in `apps/web`).
5. `npx tsc --noEmit` (api + web), `npm run lint`, `npm test` (api + domain), `npm run build` (api + web) all green; mobile boots and completes a live login.
6. Every §4 invariant has a line in the final report saying "unchanged, verified by X".
7. Prisma schema, migrations, RLS file, seeds and `.env*` untouched; generated client regenerated only if the schema changed (it must not).
8. `AGENTS.md` rewritten to describe what now exists, not what used to.
9. `npm run dev` alone brings up the whole product; killing `apps/api` degrades the UI gracefully instead of blank-screening it.

If any of 1–9 fails, the refactor is not finished — report the gap instead of
declaring success.

---

## 10. How you work (operating agreement)

- **One phase at a time.** Finish, verify, report, wait. Never start P(n+1) inside
  P(n)'s diff.
- **Smallest viable diff.** A move phase contains moves only; a SOLID phase
  contains one domain's restructuring only. Never mix a rename with a behaviour fix.
- **Pure moves first**: `git mv`, then fix imports. Do not "improve while moving".
- **Read before you write**: for every file you split, read it fully plus its
  direct importers and its tests.
- **Stop and ask** when a change would: alter a URL/response shape, touch
  `schema.prisma`/migrations/RLS/seeds, change auth or term-scope semantics,
  add a runtime dependency, delete a test, delete a notification type, or touch
  `lib/templates/`/`assets/` used by SF10 rendering.
- **No new dependencies** without approval (this includes turborepo, pnpm,
  dependency-cruiser if you can do it with ESLint).
- **Never** revert unrelated WIP. The tree is often dirty; use `git status` and
  scope your edits.
- **Never** touch `backend/src/generated/prisma/**` by hand,
  `debug-jones.tmp.ts`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`,
  `tmp-*.png|cjs|mjs` debug artifacts, unless the current phase explicitly owns them.
- **Commits**: one concern each, conventional prefixes —
  `chore(monorepo): move frontend to apps/web`,
  `refactor(api/sf10): split records service by responsibility`,
  `refactor(web/advisory): split list page into container + parts`,
  `feat(mobile): bootstrap expo app on shared api-client`,
  `chore(ci): add arch + route inventory checks`.
- **Report format** after every phase (no prose padding):

  ```
  Phase: P3 / grades
  Moved/Split: <file> (<before>→<after> lines) → <new files>
  Solid: SRP <n> · OCP <n> · LSP <n> · ISP <n> · DIP <n>
  Removed: <dead code deleted, block comments converted to one-line phrases, counts>
  Verified: tsc ✔ tests ✔ (n passed) lint ✔ build ✔ routes diff 0 ✔
  Invariants touched: <none | list + how verified>
  Risks / open questions: <…>
  Next: <phase>
  ```

- **When you cannot meet a cap without changing behaviour**, stop and propose the
  split with a line-count budget instead of leaving a 900-line file behind.

---

## 11. Appendix — PR checklist (paste into every PR)

```
[ ] Phase prefix in commit/PR title; single concern
[ ] File ≤250 lines, function ≤45, nesting ≤3, params ≤5
[ ] Comments are single-line phrases only; no `/* */`, no JSDoc, no banners, no commented-out code
[ ] Styling is Tailwind utilities + tokens; no `*.module.css`, no `styles.foo`, no hard-coded hex/px
[ ] Layer rules: routes→controller→service→usecase→repository; adapters only at edges
[ ] No prisma/react/next/axios/supabase/tesseract import outside its allowed layer
[ ] Public route + response envelope unchanged (api-inventory diff = 0)
[ ] Pagination 15 (16 for the two queue exceptions) untouched
[ ] Audit/fanout/cache-invalidate/risk-recompute calls preserved (count + order)
[ ] Notification types + desk-sound clips + localStorage keys byte-identical
[ ] Realtime channels still mounted in all 8 shells
[ ] RLS / schema / migrations / seeds untouched
[ ] typecheck + tests + lint + build run; output pasted
[ ] Metrics before/after pasted for the touched area
```
