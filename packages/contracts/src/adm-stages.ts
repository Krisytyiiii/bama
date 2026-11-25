export const ADM_STAGES = [
  "anecdotal",
  "consultation",
  "meeting_parents",
  "home_visitation",
  "certification",
  "principal_approval",
  "enrollment_monitoring",
  "completion",
] as const;

export type AdmStageCode = (typeof ADM_STAGES)[number];
