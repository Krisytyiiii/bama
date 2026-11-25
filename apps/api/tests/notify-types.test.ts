import { describe, expect, it } from "vitest";
import { NOTIF_TYPE_MAP, deriveNotifType } from "../src/lib/notify.js";

describe("notification type derivation", () => {
  it("maps known source_table:action pairs", () => {
    expect(deriveNotifType("referrals", "filed")).toBe("new_adm_referral");
    expect(deriveNotifType("interventions", "detect")).toBe("intervention_detected");
    expect(deriveNotifType("adviser_sf10_access_requests", "create")).toBe("sf10_access_requested");
  });

  it("falls back to a generic type for unmapped pairs", () => {
    expect(deriveNotifType("some_table", "some_action")).toBe("generic_some_table_some_action");
  });

  it("keeps the map data-only and collision-free per key", () => {
    expect(Object.keys(NOTIF_TYPE_MAP).every((key) => key.includes(":"))).toBe(true);
    expect(Object.keys(NOTIF_TYPE_MAP)).toHaveLength(new Set(Object.keys(NOTIF_TYPE_MAP)).size);
  });
});
