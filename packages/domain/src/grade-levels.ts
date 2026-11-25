export const GRADE_LABELS: Record<string, string> = {
  G7: "Grade 7",
  G8: "Grade 8",
  G9: "Grade 9",
  G10: "Grade 10",
  G11: "Grade 11",
  G12: "Grade 12",
};

export const GRADE_ORDER = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;

export type GradeLevelCode = (typeof GRADE_ORDER)[number];

export function gradeLabel(gradeLevel: string): string {
  return GRADE_LABELS[gradeLevel] ?? gradeLevel;
}

export function gradeToNumber(gradeLevel: string): number {
  const match = String(gradeLevel).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function isJuniorHigh(gradeLevel: string): boolean {
  const level = gradeToNumber(gradeLevel);
  return level >= 7 && level <= 10;
}

export function isSeniorHigh(gradeLevel: string): boolean {
  const level = gradeToNumber(gradeLevel);
  return level >= 11 && level <= 12;
}
