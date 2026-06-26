// App: wires the core loop together.
//   declare focus -> drift detected -> auto zero-input breadcrumb
//   -> on return, generate re-entry brief -> show in buoy.
// Also handles the optional manual quick-note (breadcrumb or idea).

import { useEffect, useState } from "react";
import { Buoy } from "./Buoy";
import { useDriftDetection, type DriftSignal } from "./useDriftDetection";
import { classify, reentryBrief } from "./ai";
import {
  getActiveFocus,
  saveFocus,
  saveBreadcrumb,
  saveBrief,
  breadcrumbsForFocus,
  uid,
} from "./db";
import type { Breadcrumb, Focus } from "./types";
import { registerGlobalShortcuts } from "./shortcuts";

export default function App() {
  const [focus, setFocus] = useState<Focus | undefined>();
  const [focusInput, setFocusInput] = useState("");
  const [isReturning, setIsReturning] = useState(false);
  const [reentryText, setReentryText] = useState<string>();

  // load any active focus on boot
  useEffect(() => {
    getActiveFocus().then(setFocus);
  }, []);

  // global shortcut (Tauri): summon quick capture from anywhere
  useEffect(() => {
    const cleanup = registerGlobalShortcuts(() => {
      // focus the window + open capture — handled inside Buoy via a custom event
      window.dispatchEvent(new CustomEvent("breadcrumb:capture"));
    });
    return () => void cleanup?.then?.((c) => c?.());
  }, []);

  // --- drift detection: the zero-friction core ---
  useDriftDetection({
    onLeave: async () => {
      // Auto-drop a zero-input breadcrumb the moment attention leaves.
      const crumb: Breadcrumb = {
        id: uid(),
        createdAt: Date.now(),
        focusId: focus?.id,
        trigger: "auto-leave",
        kind: "breadcrumb",
      };
      await saveBreadcrumb(crumb);
    },
    onReturn: async (sig: DriftSignal) => {
      // attach the away-signal to the most recent auto crumb by writing a return marker
      const marker: Breadcrumb = {
        id: uid(),
        createdAt: Date.now(),
        focusId: focus?.id,
        trigger: "auto-idle",
        kind: "breadcrumb",
        signal: { awayMs: sig.awayMs, foregroundApp: sig.foregroundApp },
      };
      await saveBreadcrumb(marker);

      // generate the re-entry brief (★)
      const crumbs = focus ? await breadcrumbsForFocus(focus.id) : [];
      const text = await reentryBrief(focus, crumbs);
      setReentryText(text);
      if (focus) {
        await saveBrief({ id: uid(), focusId: focus.id, generatedAt: Date.now(), text });
      }
      setIsReturning(true);
    },
  });

  const declareFocus = async () => {
    const label = focusInput.trim();
    if (!label) return;
    if (focus) await saveFocus({ ...focus, status: "parked", endedAt: Date.now() });
    const f: Focus = { id: uid(), label, startedAt: Date.now(), status: "active" };
    await saveFocus(f);
    setFocus(f);
    setFocusInput("");
  };

  const onQuickNote = async (text: string, asIdea: boolean) => {
    // optional manual capture; AI classifies (with graceful fallback)
    const { kind, tags } = asIdea
      ? { kind: "idea" as const, tags: [] }
      : await classify(text, focus?.label);
    const crumb: Breadcrumb = {
      id: uid(),
      createdAt: Date.now(),
      focusId: asIdea ? undefined : focus?.id,
      text,
      trigger: asIdea ? "idea" : "manual",
      kind: asIdea ? "idea" : kind,
      tags,
    };
    await saveBreadcrumb(crumb);
  };

  return (
    <div className="min-h-screen bg-buoy-deep text-amber-50">
      {/* Minimal control surface (the real product is the buoy overlay). */}
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-buoy-glow">Breadcrumb</h1>
        <p className="mt-2 text-sm text-amber-50/60">
          Leave a trail the instant your attention drifts. Find your way back when you return.
        </p>

        <div className="mt-8">
          <label className="text-xs uppercase tracking-wide text-amber-50/50">
            what are you doing right now?
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={focusInput}
              onChange={(e) => setFocusInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && declareFocus()}
              placeholder="e.g. writing cover letter"
              className="flex-1 rounded-lg bg-buoy-mist/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-buoy-core/60"
            />
            <button
              onClick={declareFocus}
              className="rounded-lg bg-buoy-core px-4 py-2 text-sm font-medium text-buoy-deep hover:brightness-110"
            >
              Set
            </button>
          </div>
          {focus && (
            <p className="mt-3 text-sm text-amber-50/70">
              Current focus: <span className="text-buoy-glow">{focus.label}</span>
            </p>
          )}
        </div>

        <p className="mt-10 text-xs leading-relaxed text-amber-50/40">
          Switch away or go idle and Breadcrumb quietly drops a marker — no typing needed.
          Come back and the buoy offers a “where was I?” brief. Tap the buoy any time to add a
          fast note or capture a stray idea.
        </p>
      </div>

      <Buoy
        focusLabel={focus?.label}
        isReturning={isReturning}
        reentryText={reentryText}
        onQuickNote={onQuickNote}
        onDismissReturn={() => setIsReturning(false)}
      />
    </div>
  );
}
