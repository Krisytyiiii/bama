export const FINAL_LOCK_STATUSES = ["locked", "adviser_approved"] as const;

export type FinalLockStatus = (typeof FINAL_LOCK_STATUSES)[number];

export function isFinalLock(status: string | null | undefined): boolean {
  return status === "locked" || status === "adviser_approved";
}
