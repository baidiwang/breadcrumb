// The heart of Breadcrumb: detect when your attention leaves, with ZERO user action.
//
// Privacy-graded signals (see BUOY_SPEC §4):
//   Level 0 (web + desktop): visibility/focus/idle — knows you LEFT, not where to.
//   Level 1 (desktop, opt-in): foreground app NAME via Tauri — never reads content.
//
// This hook fires `onLeave` when you switch away or go idle, and `onReturn` when
// you come back after being gone past a threshold. The buoy uses these to auto-drop
// a breadcrumb and to offer a re-entry brief.

import { useEffect, useRef } from "react";

type LeaveReason = "tab-hidden" | "window-blur" | "idle";

export type DriftSignal = {
  reason: LeaveReason;
  awayMs: number;
  foregroundApp?: string; // desktop Level-1 only
};

type Options = {
  idleMs?: number; // how long with no input counts as "gone" (default 90s)
  returnThresholdMs?: number; // min away time to bother with a re-entry prompt (default 60s)
  onLeave?: (leftAt: number) => void;
  onReturn?: (signal: DriftSignal) => void;
};

export function useDriftDetection(opts: Options = {}) {
  const idleMs = opts.idleMs ?? 90_000;
  const returnThreshold = opts.returnThresholdMs ?? 60_000;

  const leftAtRef = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const lastReasonRef = useRef<LeaveReason>("idle");

  // keep latest callbacks without re-subscribing listeners
  const onLeave = useRef(opts.onLeave);
  const onReturn = useRef(opts.onReturn);
  onLeave.current = opts.onLeave;
  onReturn.current = opts.onReturn;

  useEffect(() => {
    const markLeft = (reason: LeaveReason) => {
      if (leftAtRef.current != null) return; // already gone
      leftAtRef.current = Date.now();
      lastReasonRef.current = reason;
      onLeave.current?.(leftAtRef.current);
    };

    const markReturned = async () => {
      const leftAt = leftAtRef.current;
      leftAtRef.current = null;
      if (leftAt == null) return;
      const awayMs = Date.now() - leftAt;
      if (awayMs < returnThreshold) return; // too brief to matter

      let foregroundApp: string | undefined;
      // Level-1 desktop signal: best-effort, optional, name-only.
      try {
        foregroundApp = await getForegroundAppSafe();
      } catch {
        /* ignore — Level 0 still works */
      }

      onReturn.current?.({
        reason: lastReasonRef.current,
        awayMs,
        foregroundApp,
      });
    };

    const resetIdle = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      // if we were idle-gone and the user moved, treat as return
      if (leftAtRef.current != null && lastReasonRef.current === "idle") {
        void markReturned();
      }
      idleTimer.current = window.setTimeout(() => markLeft("idle"), idleMs);
    };

    const onVisibility = () => {
      if (document.hidden) markLeft("tab-hidden");
      else void markReturned();
    };
    const onBlur = () => markLeft("window-blur");
    const onFocus = () => void markReturned();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    ["mousemove", "keydown", "pointerdown", "wheel"].forEach((e) =>
      window.addEventListener(e, resetIdle, { passive: true })
    );

    resetIdle();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      ["mousemove", "keydown", "pointerdown", "wheel"].forEach((e) =>
        window.removeEventListener(e, resetIdle)
      );
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [idleMs, returnThreshold]);
}

/**
 * Level-1 desktop signal. Returns the NAME of the current foreground app (never content).
 * Falls back to undefined in the browser or if the Tauri command/permission isn't present.
 */
export async function getForegroundAppSafe(): Promise<string | undefined> {
  // Only attempt inside Tauri.
  // @ts-expect-error -- injected by Tauri at runtime
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return undefined;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const name = await invoke<string>("foreground_app");
    return name || undefined;
  } catch {
    return undefined;
  }
}
