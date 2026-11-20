"use client";

import * as React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Pagination } from "@/components/shared/pagination";
import {
  isUploadedModuleFile,
  moduleFileName,
  type AdvisoryModuleRow,
  type AdvisoryModuleStatus,
  type ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";
import motion from "./modules-motion.module.css";

const dateLabel = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const STATUS: Record<
  AdvisoryModuleStatus,
  { label: string; tone: PillTone; icon: typeof CheckCircle2 }
> = {
  submitted: { label: "Submitted", tone: "green", icon: CheckCircle2 },
  pending: { label: "Pending", tone: "amber", icon: Clock3 },
  overdue: { label: "Overdue", tone: "red", icon: TriangleAlert },
  posted: { label: "Posted", tone: "blue", icon: Megaphone },
};

const FILTER_LABELS: Record<keyof ModuleStatusCounts, string> = {
  all: "All",
  submitted: "Submitted",
  pending: "Pending",
  overdue: "Overdue",
};

const KIND_ACCENT: Record<AdvisoryModuleRow["kind"], string> = {
  adm: "#8b5cf6",
  general: "#3b82f6",
};

/** One-line summary of the module's attachment: file name, link host, or none. */
function AttachmentLine({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
        <Info size={12} className="shrink-0" aria-hidden /> No handout attached
      </span>
    );
  }
  const isFile = isUploadedModuleFile(url);
  const label = isFile ? (moduleFileName(url) ?? "Attached file") : hostOf(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-primary hover:underline"
      title={isFile ? url : label}
    >
      {isFile ? (
        <FileText size={12} className="shrink-0" aria-hidden />
      ) : (
        <Link2 size={12} className="shrink-0" aria-hidden />
      )}
      <span className="max-w-[190px] truncate">{label}</span>
      <ExternalLink size={11} className="shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

function ModuleCard({
  module,
  selected,
  index,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  module: AdvisoryModuleRow;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[module.status];
  const StatusIcon = status.icon;
  const accent = KIND_ACCENT[module.kind];
  const tracked = module.kind === "adm" && module.totalLearners > 0;
  const pct = tracked
    ? Math.min(100, Math.round((module.submittedCount / module.totalLearners) * 100))
    : 0;
  const due = dateLabel(module.dueDate);
  const released = dateLabel(module.releaseDate);

  return (
    <article
      onClick={onSelect}
      style={{ "--card-index": Math.min(index, 9) } as React.CSSProperties}
      className={`${motion.card} group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-colors [font-family:var(--font-inter)] ${
        selected
          ? "border-amber-500/60 ring-2 ring-amber-500/25"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5 p-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
          style={{ backgroundColor: accent }}
          aria-hidden
        >
          <FileText size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            aria-pressed={selected}
            className="block min-w-0 truncate text-left text-[13px] font-semibold leading-snug text-foreground hover:text-primary"
            title={`Show submissions for ${module.moduleName}`}
          >
            {module.moduleName}
          </button>
          <span className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {module.kind === "adm" ? "ADM module" : "General post"}
            {due ? ` · Due ${due}` : released ? ` · Released ${released}` : ""}
          </span>
        </div>
        <Pill tone={status.tone} label="Module status" className="shrink-0">
          <StatusIcon size={11} aria-hidden /> {status.label}
        </Pill>
      </div>

      <div className="mx-3 mb-3 flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
        {tracked ? (
          <>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                <CheckCircle2 size={12} aria-hidden /> Submissions
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">
                {module.submittedCount}/{module.totalLearners}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-border/70"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${module.moduleName} submissions`}
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-300 ${
                  pct >= 100 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <Megaphone size={12} className="shrink-0" aria-hidden />
            Posted to the section — no submission tracking
          </span>
        )}
        {module.dueDate ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <CalendarClock size={12} className="shrink-0" aria-hidden />
            <span className="truncate">{due ? `Due ${due}` : "No due date"}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <AttachmentLine url={module.moduleUrl} />
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={onOpen}
            aria-label={`View ${module.moduleName} details`}
          >
            <Info size={12} aria-hidden /> Details
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-6 w-6 px-0 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
            aria-label={`Edit ${module.moduleName}`}
          >
            <Pencil size={12} aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-6 w-6 px-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label={`Delete ${module.moduleName}`}
          >
            <Trash2 size={12} aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ModulesPanel({
  rows,
  counts,
  total,
  page,
  selectedId,
  filter,
  headerActions,
  onFilterChange,
  onPageChange,
  onAdd,
  onEdit,
  onDelete,
  onSelect,
  onOpen,
}: {
  rows: AdvisoryModuleRow[];
  counts: ModuleStatusCounts;
  total: number;
  page: number;
  selectedId: string | null;
  filter: keyof ModuleStatusCounts;
  /** Extra controls (e.g. the advisory section picker) shown beside Add module. */
  headerActions?: React.ReactNode;
  onFilterChange: (filter: keyof ModuleStatusCounts) => void;
  onPageChange: (page: number) => void;
  onAdd: () => void;
  onEdit: (module: AdvisoryModuleRow) => void;
  onDelete: (module: AdvisoryModuleRow) => void;
  onSelect: (module: AdvisoryModuleRow) => void;
  /** Fired from the card's Details action — opens the module overlay. */
  onOpen: (module: AdvisoryModuleRow) => void;
}) {
  return (
    <section
      className={`${motion.reveal} flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card`}
      aria-label="Modules"
    >
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground">
            Modules
          </h2>
          <Pill tone="blue" label="Submitted modules">
            {counts.submitted}/{counts.all} submitted
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions ?? null}
          <Button type="button" className="h-7 px-2.5 text-xs" onClick={onAdd}>
            <Plus size={13} aria-hidden /> Add module
          </Button>
        </div>
      </header>

      {counts.all > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <FilterTabs
            label="Filter modules by status"
            options={(Object.keys(FILTER_LABELS) as (keyof ModuleStatusCounts)[]).map(
              (key) => ({
                value: key,
                label: FILTER_LABELS[key],
                count: counts[key],
              }),
            )}
            value={filter}
            onChange={onFilterChange}
          />
          <span className="text-[12px] text-muted-foreground">
            {total} {total === 1 ? "module" : "modules"} released this term
          </span>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 p-4">
        {counts.all === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="m-0 text-sm font-semibold text-foreground">No modules released yet</p>
            <p className="m-0 max-w-sm text-xs text-muted-foreground">
              Post the module file or link so your advisees know where to get it, then track
              their submissions here.
            </p>
            <Button type="button" variant="outline" className="h-7 px-2.5 text-xs" onClick={onAdd}>
              <Plus size={13} aria-hidden /> Release a module
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="m-0 text-sm font-semibold text-foreground">
              No {FILTER_LABELS[filter].toLowerCase()} modules
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              Switch the status filter to see the rest of this term.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {rows.map((m, index) => (
              <ModuleCard
                key={m.id}
                module={m}
                index={index}
                selected={selectedId === m.id}
                onSelect={() => onSelect(m)}
                onOpen={() => onOpen(m)}
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="border-t border-border px-4 py-2">
          <Pagination currentPage={page} totalItems={total} onPageChange={onPageChange} />
        </div>
      ) : null}
    </section>
  );
}
