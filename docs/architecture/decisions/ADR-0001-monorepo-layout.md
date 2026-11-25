# ADR-0001: monorepo layout with apps/* and packages/*

Status: accepted (P1)
Date: 2026-11-25

## Context

The product was two sibling folders (`backend/`, `frontend/`) with no root
manifest, no shared code, and duplicated zod schemas. Mobile does not exist in
this tree. The refactor target is one monolith product, one database, one public
origin, with a mobile client added later.

## Decision

Root holds `apps/{web,api,mobile}` and `packages/{contracts,domain,api-client,ui-tokens,config,testing}`.
`apps/api` stays its own process (Express), `apps/web` is Next.js, both reachable
through one origin: `/api/*` proxied to the API.

Dependency direction is enforced by `tools/arch-check.mjs`:

```
apps/*    -> packages/*
packages/api-client -> packages/contracts
packages/domain -> packages/contracts (types only)
packages/contracts -> zod only
```

Packages never import apps; web never imports the api app or Prisma; mobile
never imports web-only code.

## Consequences

- `frontend/` -> `apps/web`, `backend/` -> `apps/api`, history preserved via `git mv`.
- CI jobs use `working-directory: apps/*`.
- The API keeps its own Docker image; the web app gains one, and
  `docker-compose.yml` runs both with `api` unreachable from outside.
- Root `package.json` is an orchestration shell only (no dependencies, no
  lockfile changes) so existing per-app installs keep working.
