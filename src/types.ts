// Core data model for Breadcrumb.
// Design stance: the tool is an *externalized working memory*, not a surveillance tool.
// Capture is low/zero-friction; AI does the heavy lifting at re-entry time.

/** A thing you've declared you're currently doing. The buoy shows this as an anchor. */
export type Focus = {
  id: string;
  label?: string; // optional — AI suggests one after the session ends
  startedAt: number;
  endedAt?: number;
  status: "active" | "done" | "parked";
};

/**
 * A breadcrumb. The key idea: most breadcrumbs are captured with ZERO typing —
 * the system drops one automatically when it detects you leaving / going idle.
 * `text` is optional and only present if you had the spare capacity to add a line.
 */
export type Breadcrumb = {
  id: string;
  createdAt: number;
  focusId?: string; // the focus that was active when this was dropped
  text?: string; // optional user line (usually empty on auto-capture)
  // why this breadcrumb exists:
  trigger: "auto-leave" | "auto-idle" | "manual" | "idea";
  // context signal captured automatically (privacy-safe):
  signal?: {
    awayMs?: number; // how long you were away/idle
    foregroundApp?: string; // desktop-only: the NAME of the app you switched to (never content)
  };
  // AI-assigned, user-correctable:
  kind: "breadcrumb" | "idea" | "unsure";
  tags?: string[];
};

/** The star feature: a generated "get back in" brief when you return. */
export type ReentryBrief = {
  id: string;
  focusId?: string;
  generatedAt: number;
  text: string; // "You were doing X, you paused at Y, your next step was Z."
};
