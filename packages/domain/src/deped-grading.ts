// DepEd transmutation table + band rules. Both apps used to carry their own
// copy of this table, which is the one place a silent 1-point drift would
// change every printed grade.

export const PASSING_GRADE = 75;

export interface TransmutationRow {
  min: number;
  grade: number;
}

export const DEPED_TRANSMUTATION: readonly TransmutationRow[] = [
  { min: 100, grade: 100 },
  { min: 98.4, grade: 99 },
  { min: 96.8, grade: 98 },
  { min: 95.2, grade: 97 },
  { min: 93.6, grade: 96 },
  { min: 92.0, grade: 95 },
  { min: 90.4, grade: 94 },
  { min: 88.8, grade: 93 },
  { min: 87.2, grade: 92 },
  { min: 85.6, grade: 91 },
  { min: 84.0, grade: 90 },
  { min: 82.4, grade: 89 },
  { min: 80.8, grade: 88 },
  { min: 79.2, grade: 87 },
  { min: 77.6, grade: 86 },
  { min: 76.0, grade: 85 },
  { min: 74.4, grade: 84 },
  { min: 72.8, grade: 83 },
  { min: 71.2, grade: 82 },
  { min: 69.6, grade: 81 },
  { min: 68.0, grade: 80 },
  { min: 66.4, grade: 79 },
  { min: 64.8, grade: 78 },
  { min: 63.2, grade: 77 },
  { min: 61.6, grade: 76 },
  { min: 60.0, grade: 75 },
  { min: 56.0, grade: 74 },
  { min: 52.0, grade: 73 },
  { min: 48.0, grade: 72 },
  { min: 44.0, grade: 71 },
  { min: 40.0, grade: 70 },
  { min: 36.0, grade: 69 },
  { min: 32.0, grade: 68 },
  { min: 28.0, grade: 67 },
  { min: 24.0, grade: 66 },
  { min: 20.0, grade: 65 },
  { min: 16.0, grade: 64 },
  { min: 12.0, grade: 63 },
  { min: 8.0, grade: 62 },
  { min: 4.0, grade: 61 },
  { min: 0, grade: 60 },
];

export function clampGrade(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function transmuteGrade(computedAverage: number): number {
  const clamped = clampGrade(computedAverage);
  for (const row of DEPED_TRANSMUTATION) {
    if (clamped >= row.min) return row.grade;
  }
  return 60;
}

export interface TransmutationBand {
  grade: number;
  low: number;
  high: number;
}

export function transmutationBand(computed: number): TransmutationBand {
  const clamped = clampGrade(computed);
  for (let index = 0; index < DEPED_TRANSMUTATION.length; index += 1) {
    const band = DEPED_TRANSMUTATION[index];
    if (!band) continue;
    if (clamped >= band.min) {
      const previous = DEPED_TRANSMUTATION[index - 1];
      return { grade: band.grade, low: band.min, high: previous ? previous.min - 0.01 : 100 };
    }
  }
  return { grade: 60, low: 0, high: 3.99 };
}

export function remarksFromTransmuted(transmuted: number): "Passed" | "Failed" {
  return transmuted >= PASSING_GRADE ? "Passed" : "Failed";
}

export type DescriptorBand =
  | "Advancing"
  | "Benchmarking"
  | "Connecting"
  | "Developing"
  | "Emerging";

export function descriptorBand(average: number): DescriptorBand {
  if (average >= 90) return "Advancing";
  if (average >= 80) return "Benchmarking";
  if (average >= 75) return "Connecting";
  if (average >= 65) return "Developing";
  return "Emerging";
}

export function meetsAcademicExcellenceAward(
  overallAverage: number,
  lowestSubject: number,
): boolean {
  return overallAverage >= 90 && lowestSubject >= 80;
}
