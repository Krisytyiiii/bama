import { describe, expect, it } from "vitest";
import {
  DEPED_TRANSMUTATION,
  PASSING_GRADE,
  descriptorBand,
  meetsAcademicExcellenceAward,
  remarksFromTransmuted,
  transmutationBand,
  transmuteGrade,
} from "@zentra/domain";

describe("DepEd transmutation", () => {
  it("locks the published band table", () => {
    expect(DEPED_TRANSMUTATION).toHaveLength(41);
    expect(DEPED_TRANSMUTATION[0]).toEqual({ min: 100, grade: 100 });
    expect(DEPED_TRANSMUTATION.at(-1)).toEqual({ min: 0, grade: 60 });
    for (let i = 1; i < DEPED_TRANSMUTATION.length; i += 1) {
      expect(DEPED_TRANSMUTATION[i]!.min).toBeLessThan(DEPED_TRANSMUTATION[i - 1]!.min);
      expect(DEPED_TRANSMUTATION[i]!.grade).toBe(DEPED_TRANSMUTATION[i - 1]!.grade - 1);
    }
  });

  it("transmutes at band boundaries", () => {
    expect(transmuteGrade(100)).toBe(100);
    expect(transmuteGrade(98.4)).toBe(99);
    expect(transmuteGrade(98.39)).toBe(98);
    expect(transmuteGrade(60)).toBe(75);
    expect(transmuteGrade(59.99)).toBe(74);
    expect(transmuteGrade(-5)).toBe(60);
    expect(transmuteGrade(250)).toBe(100);
  });

  it("reports the band around a computed average", () => {
    expect(transmutationBand(100)).toEqual({ grade: 100, low: 100, high: 100 });
    expect(transmutationBand(98.4)).toEqual({ grade: 99, low: 98.4, high: 99.99 });
    expect(transmutationBand(0)).toEqual({ grade: 60, low: 0, high: 3.99 });
  });

  it("maps remarks and bands", () => {
    expect(PASSING_GRADE).toBe(75);
    expect(remarksFromTransmuted(75)).toBe("Passed");
    expect(remarksFromTransmuted(74)).toBe("Failed");
    expect(descriptorBand(91)).toBe("Advancing");
    expect(descriptorBand(80)).toBe("Benchmarking");
    expect(descriptorBand(75)).toBe("Connecting");
    expect(descriptorBand(70)).toBe("Developing");
    expect(descriptorBand(64)).toBe("Emerging");
  });

  it("keeps the excellence-award floors", () => {
    expect(meetsAcademicExcellenceAward(90, 80)).toBe(true);
    expect(meetsAcademicExcellenceAward(90, 79.9)).toBe(false);
    expect(meetsAcademicExcellenceAward(89.9, 95)).toBe(false);
  });
});
