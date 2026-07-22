/**
 * Persistence for multiple completed MarketCompass company profiles.
 * localStorage ONLY — no accounts, no database, no server-side profile list.
 *
 * Replaces the earlier single-dashboard slot (`dashboardStorage.ts`, kept
 * as-is for its own tests and as the one-time migration source): each
 * completed dashboard is now kept as its own entry, upserted by company KRS
 * so running a new analysis for an already-saved company updates that
 * profile in place instead of creating a duplicate.
 */
import { z } from "zod";
import { companyDashboardResponseSchema } from "../contracts/companyDashboardSchema.ts";
import { DASHBOARD_STORAGE_KEY } from "./dashboardStorage.ts";
import type { CompanyProfileEntry, DashboardCompletedResponse } from "../types";

export const PROFILES_STORAGE_KEY = "marketcompass_profiles_v1";

const profileEntrySchema = z.strictObject({
  id: z.string().min(1),
  savedAt: z.string(),
  dashboard: companyDashboardResponseSchema,
});

/** The stable dedup key for a completed dashboard: its company KRS when known, else its request id. */
export function profileKeyOf(dashboard: DashboardCompletedResponse): string {
  return dashboard.company.krs ?? `req:${dashboard.requestId}`;
}

/**
 * Upserts one dashboard into a profile list: replaces the matching entry (same
 * KRS-based key) in place, or appends a new one. Pure — the caller persists.
 */
export function upsertProfile(
  profiles: CompanyProfileEntry[],
  dashboard: DashboardCompletedResponse,
  savedAt: string,
): CompanyProfileEntry[] {
  const id = profileKeyOf(dashboard);
  const entry: CompanyProfileEntry = { id, savedAt, dashboard };
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) return [...profiles, entry];
  const next = profiles.slice();
  next[index] = entry;
  return next;
}

/** Removes one profile by id. Pure — the caller persists. A no-op for an unknown id. */
export function removeProfile(profiles: CompanyProfileEntry[], id: string): CompanyProfileEntry[] {
  return profiles.filter((p) => p.id !== id);
}

/** Persists the given profile list verbatim. Never throws. */
export function saveProfiles(profiles: CompanyProfileEntry[], storage: Storage = localStorage): void {
  try {
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore — persistence is a convenience, never required for the app to work */
  }
}

/**
 * Reads the stored profile list. Returns null when the key is absent,
 * unreadable, or not a JSON array (the caller then tries legacy migration).
 * Each entry is validated independently against the public dashboard
 * contract, so one corrupt/tampered entry is dropped rather than discarding
 * the whole list — a restored profile is never trusted blindly.
 */
function readStoredProfiles(storage: Storage): CompanyProfileEntry[] | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PROFILES_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const profiles: CompanyProfileEntry[] = [];
  for (const item of parsed) {
    const validated = profileEntrySchema.safeParse(item);
    if (!validated.success) continue;
    const { dashboard } = validated.data;
    if (dashboard.status !== "completed") continue;
    profiles.push({ id: validated.data.id, savedAt: validated.data.savedAt, dashboard });
  }
  return profiles;
}

/**
 * One-time migration from the earlier single-dashboard slot: if no profile
 * list exists yet but a legacy dashboard does, it becomes the first (and
 * only) profile entry, persisted under the new key so migration never runs
 * again — even if every profile is later deleted, an empty list is still a
 * list, and the legacy dashboard is not resurrected.
 */
function migrateLegacyDashboard(storage: Storage, now: string): CompanyProfileEntry[] | null {
  let raw: string | null;
  try {
    raw = storage.getItem(DASHBOARD_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const validated = companyDashboardResponseSchema.safeParse(parsed);
  if (!validated.success || validated.data.status !== "completed") return null;

  const migrated: CompanyProfileEntry[] = [
    { id: profileKeyOf(validated.data), savedAt: now, dashboard: validated.data },
  ];
  saveProfiles(migrated, storage);
  return migrated;
}

/**
 * Loads the saved profile list, migrating the legacy single-dashboard slot
 * into it on first read if no profile list exists yet. Returns entries
 * sorted by most-recently-saved first. Never throws.
 */
export function loadProfiles(
  storage: Storage = localStorage,
  now: string = new Date().toISOString(),
): CompanyProfileEntry[] {
  const profiles = readStoredProfiles(storage) ?? migrateLegacyDashboard(storage, now) ?? [];
  return [...profiles].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}
