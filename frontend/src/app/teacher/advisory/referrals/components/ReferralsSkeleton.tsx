"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import refStyles from "./referrals.module.css";

const CARDS = 8;

/** One card shell mirroring the loaded referral card (mascot + name + LRN,
    status pill, type/session tags, two case facts, three actions). */
function ReferralCardSkeleton() {
  return (
    <li>
      <div className={refStyles.cardSkeleton}>
        <div className="flex min-w-0 items-start gap-2">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-24 rounded-md" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1.5 border-t border-border/70 pt-2.5">
          <Skeleton className="h-8 w-20 rounded-[8px]" />
          <Skeleton className="h-8 w-16 rounded-[8px]" />
          <Skeleton className="ml-auto size-8 rounded-[8px]" />
        </div>
      </div>
    </li>
  );
}

/**
 * Referrals loading state — mirrors the loaded casebook card wall: the panel
 * header strip and page action buttons, the status-tab/search toolbar, the
 * grid of case cards and its pager footer.
 */
export function ReferralsSkeleton() {
  return (
    <ShimmerGroup>
      <div className="flex min-w-0 flex-col gap-3" aria-busy="true" aria-label="Loading referrals">
        <div className={refStyles.panel}>
          <div className={refStyles.laneHead}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
          </div>

          <div className={refStyles.panelToolbar}>
            <Skeleton className="h-8 w-64 max-w-full rounded-full" />
            <Skeleton className="h-8 w-60 max-w-full rounded-full" />
          </div>

          <div className={refStyles.cardArea}>
            <ul className={refStyles.cardGrid} aria-hidden>
              {Array.from({ length: CARDS }).map((_, i) => (
                <ReferralCardSkeleton key={i} />
              ))}
            </ul>
          </div>

          <div className={refStyles.panelFooter}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShimmerGroup>
  );
}

/**
 * Tracking-rail loading state — the same sticky aside the loaded page shows on
 * the right, with the identity strip, status pills, progress bar and a run of
 * step rows, so the split layout keeps its footprint while the first page lands.
 */
export function ReferralRailSkeleton() {
  return (
    <ShimmerGroup>
      <aside className={refStyles.trackRail} aria-busy="true" aria-label="Loading referral tracking">
        <div className={refStyles.trackHead}>
          <Skeleton className="h-3 w-28" />
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-2 p-3.5" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex min-w-0 items-start gap-2">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </ShimmerGroup>
  );
}
