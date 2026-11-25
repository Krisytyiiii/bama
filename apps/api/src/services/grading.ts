import { prisma } from "../lib/prisma.js";
import { isAdmExempt } from "./adm/attendancePolicy.js";

export {
  DEPED_TRANSMUTATION,
  PASSING_GRADE,
  clampGrade,
  descriptorBand,
  meetsAcademicExcellenceAward,
  transmutationBand,
  type DescriptorBand,
  type TransmutationBand,
} from "@zentra/domain";
import { remarksFromTransmuted, transmuteGrade } from "@zentra/domain";

export { remarksFromTransmuted, transmuteGrade };

export interface DepEdWeights {
  WRITTEN_WORK: number;
  PERFORMANCE_TASK: number;
  EXAM: number;
}

export const DEPED_SHS_WEIGHTS: DepEdWeights = {
  WRITTEN_WORK: 25,
  PERFORMANCE_TASK: 45,
  EXAM: 30,
};

export const DEPED_JHS_WEIGHTS: { label: string; weights: DepEdWeights }[] = [
  {
    label: "Languages, AP, EsP",
    weights: { WRITTEN_WORK: 30, PERFORMANCE_TASK: 50, EXAM: 20 },
  },
  {
    label: "Math & Science",
    weights: { WRITTEN_WORK: 40, PERFORMANCE_TASK: 40, EXAM: 20 },
  },
  {
    label: "MAPEH & TLE",
    weights: { WRITTEN_WORK: 20, PERFORMANCE_TASK: 60, EXAM: 20 },
  },
];

export const CATEGORY_ORDER = ["WRITTEN_WORK", "PERFORMANCE_TASK", "EXAM"] as const;

export type CategoryKey = (typeof CATEGORY_ORDER)[number];

export interface CategoryEvidence {
  componentType: string;
  weightPercentage: number;

  earned: number;

  possible: number;

  assessmentCount: number;

  encodedCount: number;
}

export interface CategoryResult {
  componentType: string;
  assessmentCount: number;
  encodedCount: number;

  coverage: number | null;

  percentage: number | null;
  configuredWeight: number;

  normalizedWeight: number;

  effectiveWeight: number;
}

export interface SubjectGradeComputation {
  availableCategories: string[];
  categories: CategoryResult[];
  existingAssessments: number;
  encodedAssessments: number;
  coverage: number | null;
  rawGrade: number | null;
  computedAverage: number | null;
  transmutedGrade: number | null;
  remarks: "Passed" | "Failed" | null;
}

export function computeSubjectGrade(evidence: CategoryEvidence[]): SubjectGradeComputation {
  const byType = new Map(evidence.map((e) => [e.componentType, e]));

  const rows = CATEGORY_ORDER.map(
    (t): Required<CategoryEvidence> & { componentType: string } =>
      byType.get(t) ?? {
        componentType: t,
        weightPercentage: 0,
        earned: 0,
        possible: 0,
        assessmentCount: 0,
        encodedCount: 0,
      },
  );
  const existingAssessments = rows.reduce((s, r) => s + r.assessmentCount, 0);
  const encodedAssessments = rows.reduce((s, r) => s + r.encodedCount, 0);
  const active = rows.filter((r) => r.assessmentCount > 0);

  const categories: CategoryResult[] = rows.map((r) => ({
    componentType: r.componentType,
    assessmentCount: r.assessmentCount,
    encodedCount: r.encodedCount,
    coverage: r.assessmentCount > 0 ? r.encodedCount / r.assessmentCount : null,
    percentage:
      r.encodedCount > 0 && r.possible > 0 ? (r.earned / r.possible) * 100 : null,
    configuredWeight: r.weightPercentage,
    normalizedWeight: 0,
    effectiveWeight: 0,
  }));
  const byResult = new Map(categories.map((c) => [c.componentType, c]));

  const base: SubjectGradeComputation = {
    availableCategories: active.map((r) => r.componentType),
    categories,
    existingAssessments,
    encodedAssessments,
    coverage: existingAssessments > 0 ? encodedAssessments / existingAssessments : null,
    rawGrade: null,
    computedAverage: null,
    transmutedGrade: null,
    remarks: null,
  };

  if (active.length === 0) return base;

  const availWeight = active.reduce((s, r) => s + r.weightPercentage, 0);
  for (const r of active) {
    byResult.get(r.componentType)!.normalizedWeight =
      availWeight > 0 ? (r.weightPercentage * 100) / availWeight : 100 / active.length;
  }

  const evidenced = active.filter((r) => {
    const c = byResult.get(r.componentType)!;
    return c.percentage !== null;
  });
  if (evidenced.length === 0) return base;
  let scale = evidenced.reduce(
    (s, r) => s + byResult.get(r.componentType)!.normalizedWeight,
    0,
  );
  if (scale <= 0) {

    for (const r of evidenced) byResult.get(r.componentType)!.normalizedWeight = 100 / evidenced.length;
    scale = 100;
  }
  for (const r of evidenced) {
    const c = byResult.get(r.componentType)!;
    c.effectiveWeight = (c.normalizedWeight * 100) / scale;
  }
  const rawGrade =
    evidenced.reduce(
      (s, r) => s + byResult.get(r.componentType)!.percentage! * byResult.get(r.componentType)!.normalizedWeight,
      0,
    ) / scale;
  const transmutedGrade = transmuteGrade(rawGrade);
  return {
    ...base,
    rawGrade,
    computedAverage: rawGrade,
    transmutedGrade,
    remarks: remarksFromTransmuted(transmutedGrade),
  };
}

export async function recomputeSubjectFinal(
  student: { studentId: string } | { rosterId: string },
  subjectId: string,
  termId: string,
) {
  const gradeFilter =
    "studentId" in student ? { studentId: student.studentId } : { rosterId: student.rosterId };
  // Section-subject scope: a student's final only draws from assessments
  // added in their own section, plus legacy pre-scope rows (NULL) which
  // remain shared across sections.
  const sectionId = "studentId" in student
    ? (await prisma.studentProfile.findUnique({ where: { userId: student.studentId }, select: { sectionId: true } }))?.sectionId ?? null
    : (await prisma.studentRoster.findUnique({ where: { id: student.rosterId }, select: { sectionId: true } }))?.sectionId ?? null;
  const sectionFilter = sectionId
    ? { OR: [{ sectionId }, { sectionId: null }] }
    : {};
  // Audience split: a signed ADM learner is graded from `adm` assessments and
  // everyone else from `regular` ones. Weights and transmutation are identical
  // for both pools. Legacy classes have no `adm` rows yet, so an ADM learner
  // falls back to the regular pool rather than losing an existing grade.
  const admLearner =
    "studentId" in student
      ? await isAdmExempt(student.studentId, termId)
      : false;
  let audience: "regular" | "adm" = "regular";
  if (admLearner) {
    const admRows = await prisma.assessment.count({
      where: {
        audience: "adm",
        gradeComponent: { subjectId, termId },
        ...sectionFilter,
      },
    });
    if (admRows > 0) audience = "adm";
  }
  const components = await prisma.gradeComponent.findMany({
    where: { subjectId, termId },
    include: {
      assessments: {
        where: { audience, ...sectionFilter },
        include: { studentGrades: { where: gradeFilter } },
      },
    },
  });
  const evidence: CategoryEvidence[] = components.map((c) => {
    const encoded = c.assessments.filter((a) => a.studentGrades.length > 0);
    return {
      componentType: c.componentType,
      weightPercentage: c.weightPercentage,
      earned: encoded.reduce(
        (s, a) => s + a.studentGrades.reduce((x, g) => x + g.rawScore, 0),
        0,
      ),
      possible: encoded.reduce((s, a) => s + a.maxScore, 0),
      assessmentCount: c.assessments.length,
      encodedCount: encoded.length,
    };
  });
  const result = computeSubjectGrade(evidence);
  if (result.rawGrade === null || result.computedAverage === null) {

    if ("studentId" in student) {
      await prisma.finalGrade.deleteMany({
        where: { studentId: student.studentId, subjectId, termId },
      });
    } else {
      await prisma.finalGrade.deleteMany({
        where: { rosterId: student.rosterId, subjectId, termId },
      });
    }
    return null;
  }
  const { computedAverage, transmutedGrade, remarks } = result;
  if ("studentId" in student) {
    return prisma.finalGrade.upsert({
      where: { studentId_subjectId_termId: { studentId: student.studentId, subjectId, termId } },
      create: { studentId: student.studentId, subjectId, termId, computedAverage, transmutedGrade, remarks },
      update: { computedAverage, transmutedGrade, remarks },
    });
  }
  return prisma.finalGrade.upsert({
    where: { rosterId_subjectId_termId: { rosterId: student.rosterId, subjectId, termId } },
    create: { studentId: null, rosterId: student.rosterId, subjectId, termId, computedAverage, transmutedGrade, remarks },
    update: { computedAverage, transmutedGrade, remarks },
  });
}

export type StudentKey = { studentId: string } | { rosterId: string };

export async function finalKeysForSubjectTerm(
  subjectId: string,
  termId: string,
): Promise<StudentKey[]> {
  const rows = await prisma.finalGrade.findMany({
    where: { subjectId, termId },
    select: { studentId: true, rosterId: true },
  });
  return rows.map((r) =>
    r.studentId ? { studentId: r.studentId } : { rosterId: r.rosterId as string },
  );
}

export function computeFinalGrade(
  componentAverages: { weightPercentage: number; average: number }[]
): { computedAverage: number; transmutedGrade: number; remarks: "Passed" | "Failed" } {
  const totalWeight = componentAverages.reduce((s, c) => s + c.weightPercentage, 0);
  if (totalWeight === 0) {
    return { computedAverage: 0, transmutedGrade: 60, remarks: "Failed" };
  }
  const computedAverage =
    componentAverages.reduce((s, c) => s + (c.average * c.weightPercentage) / 100, 0);
  const transmutedGrade = transmuteGrade(computedAverage);
  return { computedAverage, transmutedGrade, remarks: remarksFromTransmuted(transmutedGrade) };
}
