import { prisma } from "../prisma.js";
import { logger } from "../pino.js";
import { invalidateTags } from "../cache.js";
import { fanoutNotification, fanoutToRole } from "./fanout.js";

async function learnerPlacement(input: { studentId?: string | null; rosterId?: string | null }) {
  if (input.studentId) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: input.studentId },
      select: {
        user: { select: { fullName: true } },
        section: { select: { name: true, adviserId: true } },
      },
    });
    if (!profile) return null;
    return {
      name: profile.user.fullName,
      section: profile.section?.name ?? "",
      adviserId: profile.section?.adviserId ?? null,
    };
  }
  if (!input.rosterId) return null;
  const roster = await prisma.studentRoster.findUnique({
    where: { id: input.rosterId },
    select: { fullName: true, section: { select: { name: true, adviserId: true } } },
  });
  if (!roster) return null;
  return {
    name: roster.fullName,
    section: roster.section?.name ?? "",
    adviserId: roster.section?.adviserId ?? null,
  };
}

export async function notifyInterventionDetected(input: {
  level: string;
  interventionId: string | null;
  studentId?: string | null;
  rosterId?: string | null;
}) {
  try {
    const placement = await learnerPlacement(input);
    const name = placement?.name ?? "A student";
    const who = `${name}${placement?.section ? ` (${placement.section})` : ""}`;

    await fanoutToRole("guidance_counselor", {
      sourceTable: "interventions",
      action: "detect",
      message: `New ${input.level}-risk intervention: ${who} — auto-flagged for follow-up.`,
      sourceId: input.interventionId ?? undefined,
    });

    if (placement?.adviserId) {
      await fanoutNotification({
        userId: placement.adviserId,
        sourceTable: "interventions",
        action: "detect",
        message: input.interventionId
          ? `Your advisee ${who} was flagged ${input.level} risk — a guidance intervention was opened.`
          : `Your advisee ${who} was flagged ${input.level} risk — Guidance has been notified.`,
        sourceId: input.interventionId ?? undefined,
      });
    }

    // A fresh detection changes the live at-risk counters the guidance shell
    // polls for its alert sound, so bust those desks now.
    void invalidateTags(["interventions", "alerts", "guidance", "overview", "risk"]);
  } catch (e) {
    logger.error({ err: e, interventionId: input.interventionId }, "intervention detect fanout failed");
  }
}

export async function notifyAcademicsSelf(input: {
  userId: string;
  sourceTable: "subjects" | "sections" | "teacher_subject_assignments";
  verb: "created" | "updated" | "assigned" | "removed";
  label: string;
  sourceId: string;
}) {
  try {
    await fanoutNotification({
      userId: input.userId,
      sourceTable: input.sourceTable,
      action: "mutate_self",
      message: `You ${input.verb} ${input.label}.`,
      sourceId: input.sourceId,
    });
  } catch (e) {
    logger.error({ err: e, sourceId: input.sourceId }, "academics self fanout failed");
  }
}

export async function notifyAccessRequestCreated(input: {
  requestId: string;
  adviserName: string;
  sectionName: string;
  adviseeCount: number;
  reason?: string | null;
  excludeUserId?: string;
}) {
  try {
    const reason = input.reason?.trim() ? ` — ${input.reason.trim()}` : "";
    await fanoutToRole("registrar", {
      sourceTable: "adviser_sf10_access_requests",
      action: "create",
      message:
        `SF10 access requested: Adviser ${input.adviserName} — ` +
        `${input.sectionName} (${input.adviseeCount} advisees)${reason}`,
      sourceId: input.requestId,
      excludeUserId: input.excludeUserId,
    });
  } catch (e) {
    logger.error({ err: e, requestId: input.requestId }, "access request fanout failed");
  }
}
