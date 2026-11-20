"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  BookOpen,
  CalendarIcon,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  isUploadedModuleFile,
  moduleFileName,
  uploadAdvisoryModuleAttachment,
  type AdvisoryModuleKind,
  type AdvisoryModulePayload,
  type AdvisoryModuleRow,
} from "@/services/teacher/advisoryModules.service";

/** Local-midnight ISO for a picked day, matching what the API stores. */
const toIso = (value: Date | undefined) =>
  value ? new Date(`${format(value, "yyyy-MM-dd")}T00:00:00`).toISOString() : null;

const fromIso = (iso: string | null) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx"];

type AttachmentMode = "upload" | "link";

interface PickedFile {
  url: string;
  name: string;
  size: number | null;
}

const errorText = (err: unknown, fallback: string) => {
  const data = (
    err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } }
  )?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export function ModuleFormDialog({
  module,
  initialKind,
  pending,
  onClose,
  onSubmit,
}: {
  /** null = release a new module; otherwise edit this one. */
  module: AdvisoryModuleRow | null;
  /** Preselected type for a new module (the empty-state quick actions). */
  initialKind?: AdvisoryModuleKind;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: AdvisoryModulePayload) => void;
}) {
  const editing = module !== null;
  const existingAttachment =
    module?.moduleUrl && isUploadedModuleFile(module.moduleUrl)
      ? {
          url: module.moduleUrl,
          name: moduleFileName(module.moduleUrl) ?? "Attached module file",
          size: null,
        }
      : null;

  const [moduleName, setModuleName] = React.useState(module?.moduleName ?? "");
  const [kind, setKind] = React.useState<AdvisoryModuleKind>(
    module?.kind ?? initialKind ?? "general",
  );
  const [dueDate, setDueDate] = React.useState<Date | undefined>(fromIso(module?.dueDate ?? null));
  const [dueOpen, setDueOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AttachmentMode>(
    existingAttachment ? "upload" : module?.moduleUrl ? "link" : "upload",
  );
  const [linkUrl, setLinkUrl] = React.useState(
    module?.moduleUrl && !isUploadedModuleFile(module.moduleUrl) ? module.moduleUrl : "",
  );
  const [attachment, setAttachment] = React.useState<PickedFile | null>(existingAttachment);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [description, setDescription] = React.useState(module?.description ?? "");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const releasedOn = fromIso(module?.releaseDate ?? null);
  const canSubmit = moduleName.trim().length > 0 && !pending && !uploading;

  const pickFile = async (file: File | undefined | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setUploadError("Only PDF, DOC, or DOCX files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("That file is larger than 10 MB. Compress it or share a link instead.");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await uploadAdvisoryModuleAttachment(file);
      setAttachment({
        url: uploaded.url,
        name: uploaded.fileName || file.name,
        size: uploaded.fileSize ?? file.size,
      });
    } catch (err) {
      setUploadError(errorText(err, "Could not upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const moduleUrl =
      mode === "upload" ? (attachment?.url ?? null) : linkUrl.trim() ? linkUrl.trim() : null;
    onSubmit({
      moduleName: moduleName.trim(),
      ...(editing ? {} : { kind }),
      dueDate: toIso(dueDate),
      moduleUrl,
      description: description.trim() ? description.trim() : null,
    });
  };

  return (
    <KanbanOverlay
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissable={!pending}
      title={editing ? "Edit module" : "Release a module"}
      ariaLabel={editing ? "Edit module" : "Release a module"}
      icon={<BookOpen size={16} aria-hidden />}
      description={
        editing
          ? "Update the module details and what your advisees receive."
          : "Post the module the whole section sees — upload a file or paste a link."
      }
      width="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <p className="m-0 text-[12px] text-muted-foreground">
            {mode === "upload" && attachment
              ? "Saving releases the module today."
              : "The release date is set when you save."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2.5 text-xs"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-7 px-3 text-xs"
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-busy={pending || uploading || undefined}
            >
              {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
              {editing ? "Save changes" : "Release module"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Module type — fixed after release. */}
        <div className="flex flex-col gap-2">
          <Label>Module type</Label>
          <div role="radiogroup" aria-label="Module type" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "general" as const,
                  label: "General post",
                  hint: "Post only — no submissions tracked. Use for references and announcements.",
                },
                {
                  value: "adm" as const,
                  label: "ADM module",
                  hint: "Released to every ADM learner in your section; submissions are tracked.",
                },
              ]
            ).map((option) => {
              const active = kind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={pending || editing}
                  onClick={() => setKind(option.value)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-amber-500/50 bg-amber-500/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    editing && !active ? "opacity-60" : "",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold">{option.label}</span>
                    {active ? (
                      <CheckCircle2 size={14} className="shrink-0 text-amber-600" aria-hidden />
                    ) : null}
                  </span>
                  <span className="text-[12px] leading-tight">{option.hint}</span>
                </button>
              );
            })}
          </div>
          {editing ? (
            <p className="m-0 text-[12px] text-muted-foreground">
              Type is fixed after release.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="module-name">Module name</Label>
          <Input
            id="module-name"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            placeholder="e.g. Module 1 · Reading Comprehension"
            maxLength={120}
            autoFocus
          />
          <p className="m-0 text-[12px] text-muted-foreground">
            {releasedOn
              ? `Released ${format(releasedOn, "MMM d, yyyy")} — set automatically on release.`
              : "Release date is set automatically when the module is released."}
          </p>
        </div>

        {/* Attachment — uploaded file or pasted link. */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Module handout</Label>
            <div
              role="tablist"
              aria-label="Attachment method"
              className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5"
            >
              {(
                [
                  { value: "upload" as const, label: "Upload file", icon: UploadCloud },
                  { value: "link" as const, label: "Paste link", icon: Link2 },
                ]
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mode === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMode(tab.value);
                      setUploadError(null);
                    }}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon size={12} aria-hidden />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "upload" ? (
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {attachment ? (
                <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <FileText size={16} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate text-[13px] font-semibold text-foreground"
                      title={attachment.name}
                    >
                      {attachment.name}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      PDF/Word handout
                      {attachment.size ? ` · ${formatFileSize(attachment.size)}` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[12px]"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove attached file"
                    onClick={() => setAttachment(null)}
                    disabled={uploading}
                  >
                    <X size={13} aria-hidden />
                  </Button>
                </div>
              ) : (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (uploading) return;
                    void pickFile(event.dataTransfer.files?.[0]);
                  }}
                  onClick={() => {
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload a module file"
                  aria-busy={uploading || undefined}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
                    dragging
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-border bg-muted/20 hover:border-amber-500/50 hover:bg-muted/40",
                    uploading ? "cursor-progress opacity-80" : "",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {uploading ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                      <UploadCloud size={16} aria-hidden />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {uploading ? "Uploading…" : "Drop a PDF or Word file here"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    or click to browse · up to 10 MB
                  </span>
                </div>
              )}
              {uploadError ? (
                <p className="m-0 text-[12px] font-medium text-destructive" role="alert">
                  {uploadError}
                </p>
              ) : (
                <p className="m-0 text-[12px] text-muted-foreground">
                  Uploading a file releases the module today.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                id="module-url"
                type="url"
                inputMode="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
              />
              <p className="m-0 text-[12px] text-muted-foreground">
                Google Drive, Docs, or any https link. Saving the link releases the module today.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-due">Due date (optional)</Label>
            <Popover open={dueOpen} onOpenChange={setDueOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="module-due"
                  variant="outline"
                  aria-label="Module due date"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon size={14} aria-hidden />
                  {dueDate ? format(dueDate, "MMM d, yyyy") : "No due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  defaultMonth={dueDate}
                  onSelect={(day) => {
                    setDueDate(day);
                    setDueOpen(false);
                  }}
                />
                {dueDate ? (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        setDueDate(undefined);
                        setDueOpen(false);
                      }}
                    >
                      Clear due date
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
            <p className="m-0 text-[12px] text-muted-foreground">
              Leave empty when the module has no deadline.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-description">Instructions (optional)</Label>
            <Textarea
              id="module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the learner must do"
              maxLength={1000}
              rows={3}
              className="min-h-[76px] resize-y"
            />
          </div>
        </div>
      </div>
    </KanbanOverlay>
  );
}
