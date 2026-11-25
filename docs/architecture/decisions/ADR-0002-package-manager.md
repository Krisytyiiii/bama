# ADR-0002: defer npm workspaces hoisting

Status: accepted (P1), revisit at P6
Date: 2026-11-25

## Context

`npm workspaces` is the stated target, but adopting it means one root
`npm install`, a hoisted `node_modules`, and a single lockfile — for a repo with
two large app installs (Next 16, Prisma 7, tesseract) sitting on a network-synced
folder. Doing that in the same commit as the directory move would make any
failure ambiguous: a broken import could be a path bug or a resolution change.

## Decision

Root `package.json` declares scripts only, using `npm --prefix apps/<app>`. Each
app keeps its own `package-lock.json` and `node_modules`. No `workspaces` field
yet, no root install.

## Consequences

- The move commit is verifiably behaviour-neutral: same dependency trees, same
  resolution, same CI commands.
- `npm run dev` / `typecheck` / `build` still work from the root through
  `tools/dev.mjs` and `--prefix` scripts.
- Hoisting remains a separate, reversible change at P6, with its own commit and
  its own verification (clean `npm ci` at root, both apps building).

## Alternatives

- pnpm + turborepo: faster, but a tooling change inside a structural refactor.
- Root install immediately: fewer scripts long-term, ambiguous failures now.
