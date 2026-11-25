import type {
  CategoryEvidence,
  CategoryResult,
  ClassComponent,
  ComponentType,
  SubjectGradeComputation,
  TransmutationBand,
} from "./grading.types";
import { DEPED_TRANSMUTATION, transmutationBand } from "@zentra/domain";

export const COMPONENT_ORDER: ComponentType[] = ["WRITTEN_WORK", "PERFORMANCE_TASK", "EXAM"];

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  WRITTEN_WORK: "WW",
  PERFORMANCE_TASK: "PT",
  EXAM: "E",
};

export const COMPONENT_NAMES: Record<ComponentType, string> = {
  WRITTEN_WORK: "Written Work",
  PERFORMANCE_TASK: "Performance Task",
  EXAM: "Exam",
};

export function gradeLabel(gradeLevel: string): string {
  const n = gradeLevel.replace(/^G/i, "");
  return /^\d+$/.test(n) ? n : gradeLevel;
}

export function isSHS(gradeLevel: string): boolean {
  const n = gradeLevel.replace(/^G/i, "");
  return n === "11" || n === "12";
}

export const TRANSMUTATION_BANDS = DEPED_TRANSMUTATION;

export function bandForGrade(computed: number): TransmutationBand {
  return transmutationBand(computed);
}

const CANONICAL_ORDER = ["WRITTEN_WORK", "PERFORMANCE_TASK", "EXAM"];

export function subjectEvidence(
  components: ClassComponent[],
  studentId: string,
): CategoryEvidence[] {
  return components.map((c) => {
    let earned = 0;
    let possible = 0;
    let encodedCount = 0;
    for (const a of c.assessments) {
      const raw = a.scores[studentId];
      if (raw == null) continue;
      encodedCount += 1;
      earned += raw;
      possible += a.maxScore;
    }
    return {
      componentType: c.type,
      weightPercentage: c.weight,
      earned,
      possible,
      assessmentCount: c.assessments.length,
      encodedCount,
    };
  });
}

export function computeSubjectGrade(evidence: CategoryEvidence[]): SubjectGradeComputation {
  const byType = new Map(evidence.map((e) => [e.componentType, e]));
  const rows = CANONICAL_ORDER.map((t) => ({
    componentType: t,
    weightPercentage: 0,
    earned: 0,
    possible: 0,
    assessmentCount: 0,
    encodedCount: 0,
    ...(byType.get(t) ?? {}),
  }));
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
  const evidenced = active.filter(
    (r) => byResult.get(r.componentType)!.percentage !== null,
  );
  if (evidenced.length === 0) return base;
  let scale = evidenced.reduce(
    (s, r) => s + byResult.get(r.componentType)!.normalizedWeight,
    0,
  );
  if (scale <= 0) {
    for (const r of evidenced) {
      byResult.get(r.componentType)!.normalizedWeight = 100 / evidenced.length;
    }
    scale = 100;
  }
  for (const r of evidenced) {
    const c = byResult.get(r.componentType)!;
    c.effectiveWeight = (c.normalizedWeight * 100) / scale;
  }
  const rawGrade =
    evidenced.reduce((s, r) => {
      const c = byResult.get(r.componentType)!;
      return s + c.percentage! * c.normalizedWeight;
    }, 0) / scale;
  const transmutedGrade = bandForGrade(rawGrade).grade;
  return {
    ...base,
    rawGrade,
    computedAverage: rawGrade,
    transmutedGrade,
    remarks: transmutedGrade >= 75 ? "Passed" : "Failed",
  };
}
