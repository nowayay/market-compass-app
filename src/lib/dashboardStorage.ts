/**
 * Persistence for the single last-completed MarketCompass dashboard result.
 * localStorage ONLY — no accounts, no database, no history of past profiles.
 *
 * `storage` is injectable (defaults to `localStorage`) so this module is
 * testable in a plain Node environment with no DOM.
 */
import { companyDashboardResponseSchema } from "../contracts/companyDashboardSchema.ts";
import type { DashboardCompletedResponse } from "../types";

export const DASHBOARD_STORAGE_KEY = "marketcompass_dashboard_v1";

/** Saves the last completed dashboard. Never throws (storage may be unavailable). */
export function saveDashboard(dashboard: DashboardCompletedResponse, storage: Storage = localStorage): void {
  try {
    storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboard));
  } catch {
    /* ignore — persistence is a convenience, never required for the app to work */
  }
}

/**
 * Restores the last completed dashboard, validated against the public
 * contract. Returns null for anything missing, malformed, tampered, or not a
 * completed result — a restored dashboard is NEVER trusted blindly.
 */
export function loadDashboard(storage: Storage = localStorage): DashboardCompletedResponse | null {
  try {
    const raw = storage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = companyDashboardResponseSchema.safeParse(parsed);
    if (!validated.success || validated.data.status !== "completed") return null;
    return validated.data;
  } catch {
    return null;
  }
}

/** Clears the stored dashboard (used by "start a new analysis"). Never throws. */
export function clearDashboard(storage: Storage = localStorage): void {
  try {
    storage.removeItem(DASHBOARD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
