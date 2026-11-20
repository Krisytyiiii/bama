"use client";
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FilePlus2,
  Loader2,
  MessageSquareText,
  SearchIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill } from "@/components/ui/pill";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination, PAGE_SIZE, shouldShowPagination } from "@/components/shared/pagination";
import assign from "@/app/principal/academics/assign/components/section-assignments.module.css";
import listStyles from "../../list/components/advisory-list.module.css";
import refStyles from "./referrals.module.css";
import { formatSurnameFirst } from "@/lib/names";
import { typeForDesk } from "./referral-types";
import {
  isWithdrawnDismissal,
  type ReferralRow,
  type ReferralStatusFilter,
} from "./use-my-referrals";
import { StudentMascot } from "./StudentMascot";
import { ReferralEmptyKanban } from "./ReferralEmptyKanban";
import { ReferralPageActions } from "./ReferralPageActions";
import { ReferralsSkeleton, ReferralRowSkeleton } from "./ReferralsSkeleton";

type StatusMeta = { variant: "amber" | "blue" | "green" | "red" | "outline"; label: string };

/* Status tones are carried by the shared Pill, same palette the desk boards
   use; the tooltip (label) names the field. */
const STATUS_TONE: Record<StatusMeta["variant"], "amber" | "blue" | "green" | "red" | "neutral"> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  red: "red",
  outline: "neutral",
};

// Escalated is not a teacher-side state: desks own escalation, so it stays
// out of the maps below. The helpers fall back to a red pill so a stray
// escalated row still renders instead of crashing the lookup.
const KNOWN_BADGE: Record<Exclude<ReferralRow["status"], "escalated">, StatusMeta> = {
  pending: { variant: "amber", label: "Pending" },
  in_progress: { variant: "blue", label: "In progress" },
  info_requested: { variant: "blue", label: "Info requested" },
  follow_up: { variant: "amber", label: "Follow up" },
  resolved: { variant: "green", label: "Resolved" },
  dismissed: { variant: "red", label: "Cancelled" },
};

export function statusBadge(status: ReferralRow["status"], dismissedByRole?: string | null): StatusMeta {
  if (status === "dismissed" && !isWithdrawnDismissal(dismissedByRole)) {
    return { variant: "red", label: "Rejected" };
  }
  return (
    KNOWN_BADGE[status as Exclude<ReferralRow["status"], "escalated">] ?? {
      variant: "red",
      label: humanize(status),
    }
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isCancellable(status: ReferralRow["status"]): boolean {
  return status !== "resolved" && status !== "dismissed";
}

/**
 * Closing state of a cancelled/rejected referral: the standard timeline
 * message plus the note the desk (or the filing teacher, on a withdrawal)
 * left when it closed the case. The original referral reason is deliberately
 * not reused here.
 */
export function dismissalMeta(
  r: ReferralRow,
): { note: string; label: string } | null {
  if (r.status !== "dismissed") return null;
  const step = [...(r.timeline ?? [])]
    .reverse()
    .find((entry) => entry.action === "referral_dismissed");
  const withdrawn = isWithdrawnDismissal(r.dismissedByRole);
  return {
    note: step?.detail?.trim() ?? "",
    label:
      step?.label ??
      (withdrawn
        ? "The referral was cancelled by the filing teacher."
        : "The referral was rejected and the case is closed."),
  };
}

const REVIEWER_LABELS: Record<string, string> = {
  nurse: "School Nurse",
  guidance_counselor: "Guidance Counselor",
  lrpc: "LRPC",
};

/** ADM stages where the case still sits with the consultation reviewer. */
const EARLY_ADM_STAGES = new Set(["anecdotal", "consultation"]);

/** Desk holding the case right now — same rule the referral cards used. */
function deskHolding(r: ReferralRow): string {
  const withReviewer =
    r.targetRole === "adm_coordinator" &&
    !!r.consultReviewer &&
    EARLY_ADM_STAGES.has(r.admStage ?? "consultation");
  return withReviewer && r.consultReviewer
    ? (REVIEWER_LABELS[r.consultReviewer] ?? humanize(r.consultReviewer))
    : humanize(r.targetRole);
}

function formatReferredDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Quiet relative stamp under the absolute date (“3d ago”). */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 0) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

const STATUS_TAB_OPTIONS: ReadonlyArray<{ value: ReferralStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

/** Short pill text + full tooltip text for a booked session slot. */
function formatSessionSlot(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: iso.slice(0, 10), full: iso };
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return {
    short: `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`,
    full: `${d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })} at ${time}`,
  };
}

/** Text for the booked-session pill on an ADM case. */
function bookedSessionPill(session: NonNullable<ReferralRow["bookedSession"]>) {
  const slot = formatSessionSlot(session.scheduledAt);
  const kind = humanize(session.sessionType);
  return {
    text: `Session ${slot.short}`,
    tooltip: `Session booked · ${slot.full}${kind ? ` · ${kind}` : ""}${
      session.venue?.trim() ? ` · ${session.venue.trim()}` : ""
    }`,
  };
}

export function ReferralsTable({
  referrals,
  counts,
  status,
  onStatusChange,
  query,
  onQueryChange,
  highlightId,
  referralsQuery,
  page,
  totalItems,
  onPageChange,
  onTrack,
  onRequestCancel,
  onNewReferral,
}: {
  referrals: ReferralRow[];
  total: number;
  unfilteredTotal: number;
  counts: { all: number; open: number; resolved: number; closed: number };
  status: ReferralStatusFilter;
  onStatusChange: (next: ReferralStatusFilter) => void;
  query: string;
  onQueryChange: (v: string) => void;
  highlightId: string | null;
  referralsQuery: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    /** True while the previous page's rows are held during a page/search fetch. */
    isPlaceholderData: boolean;
    refetch: () => void;
  };
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onTrack: (row: ReferralRow) => void;
  onRequestCancel: (row: ReferralRow) => void;
  onNewReferral?: () => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "referred", desc: true },
  ]);
  const [reasonFor, setReasonFor] = React.useState<ReferralRow | null>(null);

  // Paging and searching hit the API, so the table holds the previous slice
  // under `placeholderData` while the new page lands. Swap the body rows for
  // skeletons during that fetch (a live poll of the same page never does).
  // The skeleton count mirrors the outgoing slice (max one page of 15) so the
  // table and its pager keep their height instead of collapsing mid-fetch.
  const isPageLoading = referralsQuery.isPlaceholderData;
  const loadingRowCount = Math.min(
    Math.max(referrals.length, 1),
    PAGE_SIZE,
  );

  const columns = React.useMemo<ColumnDef<ReferralRow>[]>(
    () => [
      {
        id: "student",
        accessorFn: (row) => `${formatSurnameFirst(row.studentName)} ${row.lrn}`,
        header: "Student",
        size: 230,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <StudentMascot
              name={row.original.studentName}
              seed={row.original.lrn}
              character={row.original.mascot ?? undefined}
              size={28}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="block truncate text-[13px] font-semibold text-primary"
                title={row.original.studentName}
              >
                {formatSurnameFirst(row.original.studentName)}
              </span>
              <Pill className="tabular-nums self-start" label="LRN">
                {row.original.lrn}
              </Pill>
            </div>
          </div>
        ),
      },
      {
        id: "case",
        accessorFn: (row) => `${typeForDesk(row.targetRole).label} ${deskHolding(row)}`,
        header: "Case",
        size: 200,
        cell: ({ row }) => {
          const type = typeForDesk(row.original.targetRole);
          const session =
            row.original.status === "dismissed" ? null : row.original.bookedSession;
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <Pill tone={type.key === "adm" ? "amber" : "blue"} label="Referral type">
                  {type.label}
                </Pill>
                {session ? (
                  <Pill
                    tone="teal"
                    label={bookedSessionPill(session).tooltip}
                    className="max-w-full overflow-hidden"
                  >
                    <span className="truncate">{bookedSessionPill(session).text}</span>
                  </Pill>
                ) : null}
              </div>
              <span className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
                <Building2 size={12} className="shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{deskHolding(row.original)}</span>
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => statusBadge(row.status, row.dismissedByRole).label,
        header: "Status",
        size: 130,
        cell: ({ row }) => {
          const meta = statusBadge(row.original.status, row.original.dismissedByRole);
          return (
            <Pill tone={STATUS_TONE[meta.variant]} label="Referral status">
              {meta.label}
            </Pill>
          );
        },
      },
      {
        id: "referred",
        accessorFn: (row) => new Date(row.referredAt).getTime() || 0,
        header: "Referred",
        size: 130,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="whitespace-nowrap text-[12px] text-foreground">
              {formatReferredDate(row.original.referredAt)}
            </span>
            <span className="whitespace-nowrap text-[12px] text-muted-foreground">
              {relativeDay(row.original.referredAt)}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 230,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const cancelled = r.status === "dismissed";
          const cancellable = isCancellable(r.status);
          return (
            <div
              className="flex items-center justify-end gap-1 opacity-80 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-7 gap-1 px-2 text-[12px]"
                onClick={() => onTrack(r)}
              >
                Track
                <ArrowUpRight size={12} aria-hidden />
              </Button>
              {cancelled ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[12px]"
                  title="A cancelled referral stays closed — file a new anecdotal record to start a fresh referral"
                  aria-label={`File a new anecdotal record to refer ${r.studentName} again`}
                  onClick={() =>
                    window.open(
                      "/teacher/chat?standalone=1&new=anecdotal",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <FilePlus2 size={12} aria-hidden />
                  New record
                </Button>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[12px] text-red-600 hover:text-red-600 dark:text-red-400"
                  disabled={!cancellable}
                  onClick={() => onRequestCancel(r)}
                >
                  <X size={12} aria-hidden />
                  {cancellable ? "Cancel" : "Closed"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setReasonFor(r)}
                aria-label={
                  cancelled
                    ? `Show why the referral for ${r.studentName} was ${
                        isWithdrawnDismissal(r.dismissedByRole) ? "cancelled" : "rejected"
                      }`
                    : `Show the reason ${r.studentName} was referred`
                }
                title={
                  cancelled
                    ? isWithdrawnDismissal(r.dismissedByRole)
                      ? "Reason for cancellation"
                      : "Reason for rejection"
                    : "Reason for referral"
                }
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MessageSquareText size={13} aria-hidden />
              </button>
            </div>
          );
        },
      },
    ],
    [onTrack, onRequestCancel],
  );

  const table = useReactTable({
    data: referrals,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  if (referralsQuery.isPending) {
    return <ReferralsSkeleton />;
  }

  if (referralsQuery.isError) {
    return (
      <div className={assign.card}>
        <span className={assign.glowClip} aria-hidden="true">
          <span className={assign.cardGlow} />
        </span>
        <div className="relative flex flex-col items-center gap-2 py-6 text-center">
          <p role="alert" className="font-medium">
            Could not load your referrals.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => referralsQuery.refetch()}
            disabled={referralsQuery.isFetching}
          >
            {referralsQuery.isFetching ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                <span aria-live="polite">Retrying</span>
              </>
            ) : (
              "Try again"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Only the truly empty desk gets the starter board; a search or status tab
  // with no hits keeps the table on screen and shows its own "no match" row.
  if (counts.all === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-10rem)] w-full items-center justify-center">
        <div className="w-full">
          <ReferralEmptyKanban onNewReferral={onNewReferral} />
        </div>
      </div>
    );
  }

  const closedMeta = reasonFor ? dismissalMeta(reasonFor) : null;
  const reasonTitle = closedMeta
    ? isWithdrawnDismissal(reasonFor?.dismissedByRole)
      ? "Reason for cancellation"
      : "Reason for rejection"
    : "Reason for referral";

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-busy={isPageLoading || undefined}>
      <section className={refStyles.panel} aria-label="Referral casebook">
        <header className={refStyles.panelHead}>
          <div className="min-w-0">
            <h2 className={refStyles.panelTitle}>Referral casebook</h2>
          </div>
          <ReferralPageActions onNewReferral={onNewReferral} />
        </header>

        <div className={refStyles.panelToolbar}>
          <FilterTabs
            label="Filter referrals by status"
            value={status}
            onChange={onStatusChange}
            options={STATUS_TAB_OPTIONS.map((option) => ({
              ...option,
              count: counts[option.value],
            }))}
          />
          <InputGroup className="w-52 max-w-full shrink-0 rounded-[16px]">
            <InputGroupInput
              placeholder="Filter referrals..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              aria-label="Filter referrals"
            />
            <InputGroupAddon>
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="Clear referral filter"
                  className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X size={12} aria-hidden />
                </button>
              ) : (
                <SearchIcon />
              )}
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div className={`${listStyles.tableWrap} ${refStyles.panelBody}`}>
          <Table className="w-full table-fixed">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/30 [&>th]:border-t-0">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                        className={`group/th h-10 truncate whitespace-nowrap select-none ${
                          header.column.id === "actions" ? "text-right" : ""
                        } ${header.column.getCanSort() ? "cursor-pointer" : ""}`}
                      >
                        {header.isPlaceholder ? null : (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              header.column.id === "actions" ? "justify-end" : ""
                            }`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() ? (
                              <span
                                className={`transition-opacity ${
                                  sorted ? "opacity-100" : "opacity-0 group-hover/th:opacity-60"
                                }`}
                                aria-hidden
                              >
                                {sorted === "asc" ? (
                                  <ChevronUp size={12} />
                                ) : sorted === "desc" ? (
                                  <ChevronDown size={12} />
                                ) : (
                                  <ChevronsUpDown size={12} />
                                )}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPageLoading ? (
                Array.from({ length: loadingRowCount }).map((_, i) => (
                  <ReferralRowSkeleton key={`page-skeleton-${i}`} />
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => {
                  const r = row.original;
                  const highlighted = highlightId !== null && highlightId === r.id;
                  return (
                    <TableRow
                      key={row.id}
                      id={`teacher-referral-${r.id}`}
                      data-highlighted={highlighted || undefined}
                      onClick={() => onTrack(r)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onTrack(r);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Referral for ${r.studentName}, ${statusBadge(r.status, r.dismissedByRole).label}`}
                      className={`group/row ${listStyles.row} ${
                        highlighted ? listStyles.selected : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className="truncate"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="h-40 whitespace-normal">
                    <div className="flex w-full justify-center">
                      <InsightCallout role="status" className="w-full max-w-xl text-left">
                        <strong>No referrals match your filters.</strong> Try a different
                        name, LRN, or status — or clear the filters to see every referral.
                      </InsightCallout>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {shouldShowPagination(totalItems, PAGE_SIZE) ? (
          <footer className={refStyles.panelFooter}>
            <Pagination
              currentPage={page}
              totalItems={totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={onPageChange}
            />
          </footer>
        ) : null}
      </section>

      <KanbanOverlay
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonTitle}
        ariaLabel={
          reasonFor
            ? `${reasonTitle} for ${reasonFor.studentName}`
            : "Reason for referral"
        }
        icon={
          <span className="text-amber-500" aria-hidden>
            <MessageSquareText size={16} />
          </span>
        }
        width="md"
      >
        {reasonFor ? (
          <div className="flex min-w-0 flex-col gap-3 px-1 pb-1">
            {/* Identity strip: mascot, surname-first name, LRN + filed date,
                and the live status on the right. */}
            <div className="flex min-w-0 items-center gap-2.5">
              <StudentMascot
                name={reasonFor.studentName}
                seed={reasonFor.lrn}
                character={reasonFor.mascot ?? undefined}
                size={36}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className="truncate text-[14px] font-semibold leading-tight text-foreground"
                  title={reasonFor.studentName}
                >
                  {formatSurnameFirst(reasonFor.studentName)}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
                  <span className="tabular-nums">LRN {reasonFor.lrn}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    Filed {formatReferredDate(reasonFor.referredAt)}
                  </span>
                </span>
              </div>
              <Pill
                tone={STATUS_TONE[statusBadge(reasonFor.status, reasonFor.dismissedByRole).variant]}
                label="Referral status"
              >
                {statusBadge(reasonFor.status, reasonFor.dismissedByRole).label}
              </Pill>
            </div>

            {/* Case facts: a quiet two-column definition grid. */}
            <dl className="grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                  Referral type
                </dt>
                <dd className="m-0 min-w-0">
                  <Pill
                    tone={
                      typeForDesk(reasonFor.targetRole).key === "adm" ? "amber" : "blue"
                    }
                    label="Referral type"
                  >
                    {typeForDesk(reasonFor.targetRole).label}
                  </Pill>
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                  Handled by
                </dt>
                <dd className="m-0 truncate text-[13px] font-medium leading-snug text-foreground">
                  {deskHolding(reasonFor)}
                </dd>
              </div>
            </dl>

            <section className="flex min-w-0 flex-col gap-1.5">
              <h3 className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                {closedMeta ? "Closing note" : "Reason for referral"}
              </h3>
              {closedMeta ? (
                <>
                  <p className="m-0 break-words text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {closedMeta.label}
                  </p>
                  {closedMeta.note ? (
                    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-muted/40 p-2.5">
                      <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {isWithdrawnDismissal(reasonFor.dismissedByRole)
                          ? "Note from the filing teacher"
                          : "Note from the desk"}
                      </span>
                      <p className="m-0 break-words text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
                        {closedMeta.note}
                      </p>
                    </div>
                  ) : (
                    <p className="m-0 text-[12px] text-muted-foreground">
                      No note was left
                      {isWithdrawnDismissal(reasonFor.dismissedByRole)
                        ? " by the filing teacher."
                        : " by the desk."}
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 dark:bg-card/60">
                  <p className="m-0 break-words text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {reasonFor.reason?.trim() ||
                      "No reason was recorded for this referral."}
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </KanbanOverlay>
    </div>
  );
}
