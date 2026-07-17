// Local-first storage via IndexedDB (idb).
// Works in browser AND inside the Tauri webview. No account, no cloud for MVP.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Breadcrumb, Focus, ReentryBrief } from "./types";

interface BreadcrumbDB extends DBSchema {
  focuses: { key: string; value: Focus; indexes: { byStatus: string } };
  breadcrumbs: {
    key: string;
    value: Breadcrumb;
    indexes: { byCreatedAt: number; byFocus: string };
  };
  briefs: { key: string; value: ReentryBrief; indexes: { byGeneratedAt: number } };
  // Out-of-line key store for boolean app flags (e.g. first-run hints).
  flags: { key: string; value: boolean };
}

let _db: Promise<IDBPDatabase<BreadcrumbDB>> | null = null;

function db() {
  if (!_db) {
    _db = openDB<BreadcrumbDB>("breadcrumb", 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const f = d.createObjectStore("focuses", { keyPath: "id" });
          f.createIndex("byStatus", "status");
          const b = d.createObjectStore("breadcrumbs", { keyPath: "id" });
          b.createIndex("byCreatedAt", "createdAt");
          b.createIndex("byFocus", "focusId");
          const br = d.createObjectStore("briefs", { keyPath: "id" });
          br.createIndex("byGeneratedAt", "generatedAt");
        }
        if (oldVersion < 2) {
          d.createObjectStore("flags");
        }
      },
    });
  }
  return _db;
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// --- focuses ---
export async function saveFocus(f: Focus) {
  return (await db()).put("focuses", f);
}
export async function getActiveFocus(): Promise<Focus | undefined> {
  const all = await (await db()).getAllFromIndex("focuses", "byStatus", "active");
  return all.sort((a, b) => b.startedAt - a.startedAt)[0];
}
export async function allFocuses(): Promise<Focus[]> {
  return (await (await db()).getAll("focuses")).sort((a, b) => b.startedAt - a.startedAt);
}

// --- breadcrumbs ---
export async function saveBreadcrumb(b: Breadcrumb) {
  return (await db()).put("breadcrumbs", b);
}
export async function breadcrumbsForFocus(focusId: string): Promise<Breadcrumb[]> {
  const list = await (await db()).getAllFromIndex("breadcrumbs", "byFocus", focusId);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}
export async function recentBreadcrumbs(limit = 50): Promise<Breadcrumb[]> {
  const all = await (await db()).getAll("breadcrumbs");
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

// --- briefs ---
export async function saveBrief(b: ReentryBrief) {
  return (await db()).put("briefs", b);
}

// --- flags (one-time booleans, e.g. first-run hints) ---
export async function getFlag(key: string): Promise<boolean> {
  try {
    return (await (await db()).get("flags", key)) ?? false;
  } catch {
    return false;
  }
}
export async function setFlag(key: string, value: boolean): Promise<void> {
  try {
    await (await db()).put("flags", value, key);
  } catch {
    // non-fatal
  }
}
