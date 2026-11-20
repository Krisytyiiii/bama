"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  ClipboardList,
  ExternalLink,
  FileText,
  Link2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Pagination } from "@/components/shared/pagination";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toSlug } from "@/lib/slug";
import motion from "./modules-motion.module.css";
import type {
  AdvisoryModuleStatus,
  AdvisorySubmissionKind,
  AdvisorySubmissionRow,
  ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STATUS: Record<
  AdvisoryModuleStatus,
  { label: string; tone: PillTone; icon: typeof CheckCircle2 }
> = {
  submitted: { label: "Submitted", tone: "green", icon: CheckCircle2 },
  pending: { label: "Not yet submitted", tone: "red", icon: Clock3 },
  overdue: { label: "Overdue", tone: "red", icon: TriangleAlert },
  posted: { label: "Posted", tone: "blue", icon: CheckCircle2 },
};

const KIND: Record<AdvisorySubmissionKind, { label: string; tone: PillTone; icon: typeof Link2 }> = {
  link: { label: "Link", tone: "blue", icon: Link2 },
  file: { label: "File", tone: "violet", icon: FileText },
  physical: { label: "In person", tone: "teal", icon: CheckCircle2 },
};

/** The learner's answer, as a link / file / plain note. */
function AnswerLink({ row }: { row: AdvisorySubmissionRow }) {
  if (row.submissionKind === "link" && row.submissionUrl) {
    return (
      <a
        href={row.submissionUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        title={row.submissionUrl}
      >
        <ExternalLink size={12} className="shrink-0" aria-hidden />
        <span className="truncate">Open submitted link</span>
      </a>
    );
  }
  if (row.submissionKind === "file" && row.fileUrl) {
    return (
      <a
        href={row.fileUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        title={row.fileUrl}
      >
        <FileText size={12} className="shrink-0" aria-hidden />
        <span className="truncate">{row.fileName ?? "Open file"}</span>
      </a>
    );
  }
  if (row.submitted && row.submissionKind === "physical") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
        Passed in person
        {row.fileUrl ? (
          <a
            href={row.fileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary hover:underline"
          >
            · View proof
          </a>
        ) : null}
      </span>
    );
  }
  return <span className="text-[12px] text-muted-foreground">No answer yet</span>;
}

export function SubmissionsTable({
  moduleName,
  rows,
  counts,
  total,
  page,
  onPageChange,
}: {
  moduleName: string;
  rows: AdvisorySubmissionRow[];
  counts: ModuleStatusCounts;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const pct = counts.all > 0 ? Math.round((counts.submitted / counts.all) * 100) : 0;

  return (
    <section
      className={`${motion.reveal} flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card`}
      aria-label="Student submissions"
    >
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground">
            Student submissions
          </h2>
          <Pill tone="blue" label="Module" title={moduleName}>
            {moduleName}
          </Pill>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-border/70 sm:block"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Submitted submissions"
          >
            <span
              className={`block h-full rounded-full transition-[width] duration-300 ${
                pct >= 100 ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <Pill tone="green" label="Submitted submissions">
            {counts.submitted}/{counts.all} submitted
          </Pill>
        </div>
      </header>

      {counts.all === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="m-0 text-sm font-semibold text-foreground">No advisees yet</p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            Learners in this advisory section will appear here once enrolled.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[720px] table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 [&>th]:border-t-0">
                <TableHead style={{ width: "24%" }} className="h-10">
                  Learner
                </TableHead>
                <TableHead style={{ width: "15%" }} className="h-10">
                  Status
                </TableHead>
                <TableHead style={{ width: "16%" }} className="h-10">
                  Submitted
                </TableHead>
                <TableHead style={{ width: "23%" }} className="h-10">
                  Answer
                </TableHead>
                <TableHead style={{ width: "14%" }} className="h-10">
                  Remarks
                </TableHead>
                <TableHead style={{ width: "8%" }} className="h-10 text-right">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                    No submissions match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const status = STATUS[row.status];
                  const StatusIcon = status.icon;
                  const kind = KIND[row.submissionKind];
                  const KindIcon = kind.icon;
                  return (
                    <TableRow key={row.key} className="group/row">
                      <TableCell className="py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <StudentMascot
                            name={row.name}
                            seed={row.lrn}
                            character={row.mascot ?? undefined}
                            size={28}
                          />
                          <div className="flex min-w-0 flex-col">
                            <span
                              className="truncate text-[13px] font-semibold text-foreground"
                              title={row.name}
                            >
                              {row.name}
                            </span>
                            <span className="truncate text-[12px] tabular-nums text-muted-foreground">
                              LRN {row.lrn}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill tone={status.tone} label="Submission status">
                          <StatusIcon size={11} aria-hidden /> {status.label}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-[12px] tabular-nums text-foreground">
                            {row.submittedAt ? dateLabel(row.submittedAt) : "Not yet"}
                          </span>
                          {row.submitted ? (
                            <Pill tone={kind.tone} label="Submission type">
                              <KindIcon size={11} aria-hidden /> {kind.label}
                            </Pill>
                          ) : (
                            <Pill tone="neutral" label="Submission type">
                              No submission
                            </Pill>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AnswerLink row={row} />
                      </TableCell>
                      <TableCell>
                        <span
                          className="line-clamp-2 text-[12px] text-muted-foreground"
                          title={row.remarks ?? undefined}
                        >
                          {row.remarks || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          variant="ghost"
                          className="h-6 px-1.5 text-[12px] opacity-70 transition-opacity group-hover/row:opacity-100"
                        >
                          <a
                            href={`/teacher/advisory/adm-cases/${toSlug(row.name)}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Monitor ${row.name} in a new tab`}
                          >
                            <ClipboardList size={12} aria-hidden /> Monitor
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 ? (
        <div className="border-t border-border px-4 py-2">
          <Pagination currentPage={page} totalItems={total} onPageChange={onPageChange} />
        </div>
      ) : null}
    </section>
  );
}
