"use client";

import * as React from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  Flag,
  HeartHandshake,
  ListChecks,
  MapPin,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { toast } from "@/components/ui/sonner";
import { outcomeLabel, outcomeTone, riskTone } from "@/lib/labels/status-tone";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { formatStatus } from "@/lib/labels/text";
import { cn } from "@/lib/utils";
import type {
  AdvisoryInterventionRow,
  AdvisoryInterventionSession,
} from "@/services/teacher/interventions.service";
import {
  approvalTone,
  formatDate,
  formatDateTime,
  sessionStatusTone,
} from "./intervention-row";

const FACTORS: {
  key: keyof AdvisoryInterventionRow["factors"];
  label: string;
  tone: "amber" | "sky" | "rose";
}[] = [
  { key: "academic", label: "Academic", tone: "amber" },
  { key: "attendance", label: "Attendance", tone: "sky" },
  { key: "behavioral", label: "Anecdotal", tone: "rose" },
];

type SheetTab = "overview" | "sessions";

function SectionCard({
  icon: Icon,
  title,
  aside,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.02em] text-foreground">
          <Icon size={13} className="text-amber-600 dark:text-amber-400" aria-hidden />
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function FactTile({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5",
        className,
      )}
    >
      <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 text-xs font-medium break-words text-foreground">{children}</dd>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Icon size={13} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-xs font-semibold text-foreground">{value}</span>
        {hint ? (
          <span className="truncate text-[12px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

function NoteBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-2 border-amber-500/50 bg-muted/40 px-2.5 py-2">
      <p className="m-0 text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
        {children}
      </p>
    </div>
  );
}

/** One counselling session on the vertical timeline. */
function SessionItem({
  session,
  index,
  last,
}: {
  session: AdvisoryInterventionSession;
  index: number;
  last: boolean;
}) {
  return (
    <li className="relative flex min-w-0 gap-2.5 pl-0">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums",
            session.status === "completed"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : session.status === "cancelled"
                ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
          )}
        >
          {index + 1}
        </span>
        {last ? null : <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">
            {sessionTypeLabel(session.sessionType)}
          </span>
          <Pill tone={sessionStatusTone(session.status)} label="Session status">
            {formatStatus(session.status)}
          </Pill>
          {session.attachmentsCount > 0 ? (
            <Pill tone="neutral" label="Attachments">
              <Paperclip size={10} aria-hidden />
              {session.attachmentsCount}
            </Pill>
          ) : null}
          <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {formatDateTime(session.scheduledAt)}
          </span>
        </div>

        {session.venue ? (
          <p className="m-0 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <MapPin size={11} aria-hidden />
            {session.venue}
          </p>
        ) : null}
        {session.sessionNotes ? (
          <p className="m-0 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {session.sessionNotes}
          </p>
        ) : null}
        {session.outcome ? (
          <p className="m-0 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">Outcome:</span> {session.outcome}
          </p>
        ) : null}
        {session.cancelReason ? (
          <p className="m-0 text-[12px] text-red-600 dark:text-red-400">
            <span className="font-semibold">Cancelled:</span> {session.cancelReason}
          </p>
        ) : null}
        {session.completedAt ? (
          <p className="m-0 text-[12px] text-muted-foreground">
            Completed {formatDate(session.completedAt)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Copyable LRN pill — the number advisers read out to the registrar. */
function LrnPill({ lrn }: { lrn: string | null }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    if (!lrn) return;
    try {
      await navigator.clipboard.writeText(lrn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success({ title: "LRN copied", description: lrn });
    } catch {
      toast.error({ title: "Copy failed", description: "Select the LRN and copy it manually." });
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <Pill label="LRN" className="tabular-nums">
        {lrn || "—"}
      </Pill>
      {lrn ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground hover:text-foreground"
          aria-label="Copy LRN"
          title="Copy LRN"
          onClick={() => void copy()}
        >
          {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
        </Button>
      ) : null}
    </span>
  );
}

function CaseSheet({ row }: { row: AdvisoryInterventionRow }) {
  const [tab, setTab] = React.useState<SheetTab>("overview");
  const intervention = row.intervention;
  const activeFactors = FACTORS.filter((factor) => row.factors[factor.key]);
  const sessions = intervention?.sessions ?? [];
  const doneCount = sessions.filter((session) => session.status === "completed").length;
  const scheduledCount = sessions.filter((session) => session.status === "scheduled").length;
  const nextSession = sessions.find((session) => session.status === "scheduled");

  const showSessionsTab = Boolean(intervention);
  const activeTab: SheetTab = showSessionsTab ? tab : "overview";

  return (
    <div className="flex flex-col gap-3 px-0.5 pb-1">
      {/* Identity + case status summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/25 p-3">
        <StudentMascot
          name={row.name}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="m-0 truncate text-sm font-bold text-foreground">{row.name}</p>
            <Pill tone={riskTone(row.riskLevel)} label="Risk level">
              {row.riskLevel} risk
            </Pill>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LrnPill lrn={row.lrn} />
            <Pill label="Grade level">{row.gradeLevel || "—"}</Pill>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Pill
            tone={intervention ? outcomeTone(intervention.outcomeStatus) : "neutral"}
            label="Intervention state"
          >
            {intervention ? outcomeLabel(intervention.outcomeStatus) : "No plan yet"}
          </Pill>
          {intervention ? (
            <Pill tone={approvalTone(intervention.approvalStatus)} label="Approval">
              {formatStatus(intervention.approvalStatus)}
            </Pill>
          ) : null}
        </div>
      </div>

      {/* Case-at-a-glance strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          icon={Flag}
          label="Flagged"
          value={formatDate(row.detectedAt)}
          hint={`${row.riskCount} flag${row.riskCount === 1 ? "" : "s"} this term`}
        />
        <StatTile
          icon={HeartHandshake}
          label="Risk factors"
          value={`${activeFactors.length} active`}
          hint={
            activeFactors.length > 0
              ? activeFactors.map((factor) => factor.label).join(" · ")
              : "None active"
          }
        />
        <StatTile
          icon={ListChecks}
          label="Sessions done"
          value={intervention ? `${doneCount}` : "—"}
          hint={scheduledCount > 0 ? `${scheduledCount} booked` : "None booked"}
        />
        <StatTile
          icon={CalendarClock}
          label="Next session"
          value={nextSession ? formatDate(nextSession.scheduledAt) : "—"}
          hint={nextSession ? sessionTypeLabel(nextSession.sessionType) : "Not scheduled"}
        />
      </div>

      {/* In-sheet navigation */}
      {showSessionsTab ? (
        <FilterTabs
          label="Case detail views"
          options={[
            { value: "overview" as const, label: "Overview" },
            { value: "sessions" as const, label: "Sessions", count: sessions.length },
          ]}
          value={activeTab}
          onChange={setTab}
          className="self-start"
        />
      ) : null}

      {activeTab === "overview" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-3 py-2">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Risk factors
            </span>
            {activeFactors.length > 0 ? (
              activeFactors.map((factor) => (
                <Pill key={factor.key} tone={factor.tone} label={`${factor.label} risk factor`}>
                  {factor.label}
                </Pill>
              ))
            ) : (
              <Pill tone="neutral" label="Risk factors">
                None active
              </Pill>
            )}
            <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
              {activeFactors.length} active
            </span>
          </div>

          {intervention ? (
            <SectionCard
              icon={ClipboardList}
              title="Follow-up plan"
              aside={
                intervention.priority ? (
                  <Pill
                    tone={
                      intervention.priority === "high"
                        ? "red"
                        : intervention.priority === "low"
                          ? "neutral"
                          : "blue"
                    }
                    label="Priority"
                  >
                    {formatStatus(intervention.priority)} priority
                  </Pill>
                ) : null
              }
            >
              <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FactTile label="Recommended action" className="sm:col-span-2">
                  {intervention.recommendedAction}
                </FactTile>
                <FactTile label="Assignee">
                  {intervention.assignee ?? "Not assigned yet"}
                </FactTile>
                <FactTile label="Assigned">{formatDate(intervention.assignedAt)}</FactTile>
              </dl>
              {intervention.intakeNotes ? (
                <NoteBlock label="Intake notes">{intervention.intakeNotes}</NoteBlock>
              ) : null}
              {intervention.outcomeNotes ? (
                <NoteBlock label="Outcome notes">{intervention.outcomeNotes}</NoteBlock>
              ) : null}
            </SectionCard>
          ) : (
            <SectionCard
              icon={ClipboardList}
              title="Follow-up plan"
              aside={
                <Pill tone="neutral" label="Plan state">
                  Not opened
                </Pill>
              }
            >
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
                <HeartHandshake
                  size={14}
                  className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <p className="m-0 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                  <strong className="font-semibold">No plan yet.</strong> Guidance has flagged this
                  learner but has not opened an intervention for the current term.
                </p>
              </div>
            </SectionCard>
          )}
        </div>
      ) : (
        <SectionCard
          icon={CalendarDays}
          title="Counseling sessions"
          aside={
            sessions.length > 0 ? (
              <div className="flex items-center gap-1">
                {doneCount > 0 ? <Pill tone="green">{doneCount} done</Pill> : null}
                {scheduledCount > 0 ? <Pill tone="blue">{scheduledCount} booked</Pill> : null}
              </div>
            ) : null
          }
        >
          {sessions.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {sessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  index={index}
                  last={index === sessions.length - 1}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-6 text-center">
              <CalendarClock size={16} className="text-muted-foreground" aria-hidden />
              <p className="m-0 mt-1 text-xs font-semibold text-foreground">
                No sessions booked yet
              </p>
              <p className="m-0 text-[12px] text-muted-foreground">
                The guidance desk books the first counseling session.
              </p>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

export function InterventionDetailOverlay({
  row,
  onClose,
}: {
  row: AdvisoryInterventionRow | null;
  onClose: () => void;
}) {
  return (
    <KanbanOverlay
      open={!!row}
      onClose={onClose}
      title={row?.name ?? "Intervention"}
      ariaLabel={row ? `Intervention details for ${row.name}` : "Intervention details"}
      icon={
        <span className="text-amber-600 dark:text-amber-400" aria-hidden>
          <HeartHandshake size={14} />
        </span>
      }
      description={
        row
          ? `Flagged ${formatDate(row.detectedAt)} · read-only mirror of the guidance follow-up`
          : undefined
      }
      width="xl"
    >
      {row ? <CaseSheet key={row.key} row={row} /> : null}
    </KanbanOverlay>
  );
}
