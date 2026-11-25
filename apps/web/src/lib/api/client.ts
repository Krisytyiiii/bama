import { createApiClient } from "@zentra/api-client";
import { decodeTokenIdentity, canSteerTermRole } from "@/lib/auth/roles";
import { clearTermStorage, readStoredTerm, type StoredTerm } from "@/lib/term/termStorage";
import { isRealtimeFresh } from "@/lib/api/fresh";

const ACCESS_KEY = "zentra.access";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(ACCESS_KEY, token);
  else window.localStorage.removeItem(ACCESS_KEY);
}

export type ActiveTermScope = StoredTerm;

export function getActiveTermScope(): ActiveTermScope | null {
  if (typeof window === "undefined") return null;
  const identity = decodeTokenIdentity(getAccessToken());
  if (!identity || !canSteerTermRole(identity.role)) return null;
  return readStoredTerm(identity.sub);
}

function redirectToUnauthorized() {
  if (typeof window === "undefined") return;
  const identity = decodeTokenIdentity(getAccessToken());
  setAccessToken(null);
  clearTermStorage(identity?.sub ?? null);
  if (window.location.pathname !== "/errors/403") {
    window.location.href = "/errors/403";
  }
}

function scopeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  // Only term-steering roles (teachers + principal) carry a term. Every other
  // desk is scoped server-side, so its requests must never send term headers.
  const identity = decodeTokenIdentity(getAccessToken());
  if (identity && canSteerTermRole(identity.role)) {
    const scope = getActiveTermScope();
    if (scope?.schoolYearId) headers["x-school-year-id"] = scope.schoolYearId;
    if (scope?.termId) headers["x-term-id"] = scope.termId;
  }
  // Realtime just told us the data changed: make the follow-up GET skip the
  // API's Redis cache read so the screen updates in the same tick as the alert.
  if (isRealtimeFresh()) headers["x-zentra-fresh"] = "1";
  return headers;
}

const handle = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  getToken: getAccessToken,
  setToken: setAccessToken,
  extraHeaders: scopeHeaders,
  onSessionExpired: redirectToUnauthorized,
});

export const apiClient = handle.client;

export async function logout(): Promise<void> {
  const identity = decodeTokenIdentity(getAccessToken());
  await handle.logout();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("zentra.refresh");
  }
  clearTermStorage(identity?.sub ?? null);
}
