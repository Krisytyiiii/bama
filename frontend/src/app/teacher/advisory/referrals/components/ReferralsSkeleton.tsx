"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import listStyles from "../../list/components/advisory-list.module.css";
import refStyles from "./referrals.module.css";

const ROWS = 8;
/** Column widths mirror the real table (Student, Case, Status, Referred, Actions). */
const WIDTHS = [230, 200, 130, 130, 230];

/** One table row mirroring the loaded referral row — reused when a page fetch
    swaps the body rows for skeletons while the header/pager stay put. */
export function ReferralRowSkeleton() {
  return (
    <TableRow>
      <TableCell style={{ width: WIDTHS[0] }}>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-24 rounded-md" />
          </div>
        </div>
      </TableCell>
      <TableCell style={{ width: WIDTHS[1] }}>
        <div className="flex min-w-0 flex-col gap-1">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </TableCell>
      <TableCell style={{ width: WIDTHS[2] }}>
        <Skeleton className="h-5 w-20 rounded-full" />
      </TableCell>
      <TableCell style={{ width: WIDTHS[3] }}>
        <div className="flex min-w-0 flex-col gap-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      </TableCell>
      <TableCell style={{ width: WIDTHS[4] }}>
        <div className="flex items-center justify-end gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="size-7 shrink-0 rounded-md" />
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Referrals loading state — mirrors the loaded casebook row for row: the panel
 * header strip and page action buttons, the status-tab toolbar, the five-column
 * referral table (mascot + name + LRN pill, case type/desk, status pill,
 * referred date, action buttons) and its pager footer.
 */
export function ReferralsSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4" aria-busy="true" aria-label="Loading referrals">
      <div className={refStyles.panel}>
        <div className={`${refStyles.panelHead} items-center`}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-28 rounded-md" />
            ))}
          </div>
        </div>
        <div className={refStyles.panelToolbar}>
          <Skeleton className="h-7 w-64 rounded-full" />
          <Skeleton className="h-9 w-52 shrink-0 rounded-[16px]" />
        </div>

        <div className={`${listStyles.tableWrap} ${refStyles.panelBody}`}>
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 [&>th]:border-t-0">
                {WIDTHS.map((width, i) => (
                  <TableHead key={i} style={{ width }} className="h-10">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: ROWS }).map((_, i) => (
                <ReferralRowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
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
  );
}
