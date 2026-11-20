"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import styles from "./modules-skeleton.module.css";

const MODULE_CARDS = 6;
const SUBMISSION_ROWS = 6;

/** One module tile placeholder — mirrors the loaded card in ModulesPanel. */
function ModuleCardSkeleton() {
  return (
    <article
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
      aria-hidden
    >
      <div className="flex min-w-0 items-start gap-2.5 p-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0 rounded-md" />
      </div>

      <div className="mx-3 mb-3 flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <Skeleton className="h-3 w-24" />
        <div className="flex shrink-0 items-center gap-1">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="size-6 rounded-md" />
        </div>
      </div>
    </article>
  );
}

/** One submission row placeholder — mirrors the loaded table in SubmissionsTable. */
function SubmissionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5" aria-hidden>
      <Skeleton className="size-7 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <Skeleton className="h-5 w-24 shrink-0 rounded-md" />
      <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
    </div>
  );
}

/**
 * Loading state for the adviser Modules desk. Mirrors the loaded page one-for-one:
 * the Modules panel (header, status filter bar, card grid and pager) followed by
 * the Student submissions panel (header, learner rows and pager).
 */
export function AdvisoryModulesSkeleton() {
  return (
    <div className={`${styles.root} flex flex-col gap-4`} aria-busy="true" aria-label="Loading modules">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-7 w-40 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-3 w-40" />
        </div>

        <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {Array.from({ length: MODULE_CARDS }).map((_, i) => (
            <ModuleCardSkeleton key={i} />
          ))}
        </div>

        <div className="border-t border-border px-4 py-2">
          <ZentraPaginationSkeleton />
        </div>
      </section>

      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-32 rounded-md" />
          </div>
          <Skeleton className="h-5 w-28 rounded-md" />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: SUBMISSION_ROWS }).map((_, i) => (
            <SubmissionRowSkeleton key={i} />
          ))}
        </div>

        <div className="border-t border-border px-4 py-2">
          <ZentraPaginationSkeleton />
        </div>
      </section>
    </div>
  );
}
