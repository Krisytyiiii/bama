import { describe, expect, it } from "vitest";
import {
  FINAL_LOCK_STATUSES,
  GRADE_LABELS,
  GRADE_ORDER,
  gradeLabel,
  gradeToNumber,
  isFinalLock,
  isJuniorHigh,
  isSeniorHigh,
} from "../src/lib/grades.js";

describe("shared domain grade helpers", () => {
  it("labels every configured grade", () => {
    for (const grade of GRADE_ORDER) {
      expect(GRADE_LABELS[grade]).toBe(`Grade ${gradeToNumber(grade)}`);
    }
  });

  it("falls back to the raw code for unknown levels", () => {
    expect(gradeLabel("G13")).toBe("G13");
    expect(gradeLabel("")).toBe("");
  });

  it("parses numbers out of grade codes", () => {
    expect(gradeToNumber("G7")).toBe(7);
    expect(gradeToNumber("Grade 12")).toBe(12);
    expect(gradeToNumber("nope")).toBe(0);
  });

  it("bands junior and senior high", () => {
    expect(GRADE_ORDER.filter(isJuniorHigh)).toEqual(["G7", "G8", "G9", "G10"]);
    expect(GRADE_ORDER.filter(isSeniorHigh)).toEqual(["G11", "G12"]);
  });

  it("treats only the lock statuses as final", () => {
    expect(FINAL_LOCK_STATUSES).toEqual(["locked", "adviser_approved"]);
    expect(isFinalLock("locked")).toBe(true);
    expect(isFinalLock("adviser_approved")).toBe(true);
    expect(isFinalLock("unlocked")).toBe(false);
    expect(isFinalLock(null)).toBe(false);
  });
});
