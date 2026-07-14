// App: wires the core loop together.
//   start session (optional label) -> drift detected -> auto zero-input breadcrumb
//   -> on return, generate re-entry brief -> show in buoy.
//   end session -> AI infers a name if none was given -> confirmable suggestion.

import { useEffect, useState } from "react";
import { Buoy } from "./Buoy";
import { useDriftDetection, type DriftSignal } from "./useDriftDetection";
import { classify, reentryBrief, suggestSessionName } from "./ai";
import {
  allFocuses,
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
  const [sessionInput, setSessionInput] = useState("");
  const [recentFocuses, setRecentFocuses] = useState<Focus[]>([]);

  // Session naming: tracks the focus awaiting a name + the AI suggestion
  const [namingFocus, setNamingFocus] = useState<Focus | undefined>();
  const [suggestedName, setSuggestedName] = useState<string | undefined>();
  const [nameEditDraft, setNameEditDraft] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const [isReturning, setIsReturning] = useState(false);
  const [reentryText, setReentryText] = useState<string | undefined>();

  useEffect(() => {
    getActiveFocus().then(setFocus);
    void loadRecentFocuses();
  }, []);

  const loadRecentFocuses = async () => {
    const all = await allFocuses();
    const seen = new Set<string>();
    const chips: Focus[] = [];
    for (const f of all) {
      if (!f.label || f.status === "active") continue;
      if (seen.has(f.label)) continue;
      seen.add(f.label);
      chips.push(f);
      if (chips.length >= 5) break;
    }
    setRecentFocuses(chips);
  };

  useEffect(() => {
    const cleanup = registerGlobalShortcuts(() => {
      window.dispatchEvent(new CustomEvent("breadcrumb:capture"));
    });
    return () => void cleanup?.then?.((c) => c?.());
  }, []);

  // Fire the AI naming suggestion for a given focus + its breadcrumbs.
  const tryNameSession = async (f: Focus, crumbs: Breadcrumb[]) => {
    const name = await suggestSessionName(crumbs).catch(() => "");
    if (!name) return;
    setNamingFocus(f);
    setSuggestedName(name);
    setNameEditDraft(name);
    setIsEditingName(false);
  };

  // --- drift detection: the zero-friction core ---
  useDriftDetection({
    onLeave: async () => {
      await saveBreadcrumb({
        id: uid(),
        createdAt: Date.now(),
        focusId: focus?.id,
        trigger: "auto-leave",
        kind: "breadcrumb",
      });
    },
    onReturn: async (sig: DriftSignal) => {
      const marker: Breadcrumb = {
        id: uid(),
        createdAt: Date.now(),
        focusId: focus?.id,
        trigger: "auto-idle",
        kind: "breadcrumb",
        signal: { awayMs: sig.awayMs, foregroundApp: sig.foregroundApp },
      };
      await saveBreadcrumb(marker);

      const crumbs = focus ? await breadcrumbsForFocus(focus.id) : [];
      const text = await reentryBrief(focus, crumbs);
      setReentryText(text);
      if (focus) {
        await saveBrief({ id: uid(), focusId: focus.id, generatedAt: Date.now(), text });
        // Suggest a name on "where was I?" if the active session is still unlabeled
        if (!focus.label && crumbs.length > 0 && !namingFocus) {
          void tryNameSession(focus, crumbs);
        }
      }
      setIsReturning(true);
    },
  });

  // --- session lifecycle ---
  const startSession = async (label?: string) => {
    const trimmed = label?.trim() || undefined;
    if (focus) await saveFocus({ ...focus, status: "parked", endedAt: Date.now() });
    const f: Focus = { id: uid(), label: trimmed, startedAt: Date.now(), status: "active" };
    await saveFocus(f);
    setFocus(f);
    setSessionInput("");
    setNamingFocus(undefined);
    setSuggestedName(undefined);
    void loadRecentFocuses();
  };

  const endSession = async () => {
    if (!focus) return;
    const ended: Focus = { ...focus, status: "done", endedAt: Date.now() };
    await saveFocus(ended);
    setFocus(undefined);
    void loadRecentFocuses();
    if (!ended.label) {
      const crumbs = await breadcrumbsForFocus(ended.id);
      if (crumbs.length > 0) void tryNameSession(ended, crumbs);
    }
  };

  // --- name confirmation ---
  const confirmName = async (name: string) => {
    if (!namingFocus || !name.trim()) { dismissName(); return; }
    const updated = { ...namingFocus, label: name.trim() };
    await saveFocus(updated);
    if (focus?.id === namingFocus.id) setFocus(updated);
    setNamingFocus(undefined);
    setSuggestedName(undefined);
    setIsEditingName(false);
    void loadRecentFocuses();
  };

  const dismissName = () => {
    setNamingFocus(undefined);
    setSuggestedName(undefined);
    setIsEditingName(false);
  };

  // --- quick note from buoy ---
  const onQuickNote = async (text: string, asIdea: boolean) => {
    const { kind, tags } = asIdea
      ? { kind: "idea" as const, tags: [] }
      : await classify(text, focus?.label);
    await saveBreadcrumb({
      id: uid(),
      createdAt: Date.now(),
      focusId: asIdea ? undefined : focus?.id,
      text,
      trigger: asIdea ? "idea" : "manual",
      kind: asIdea ? "idea" : kind,
      tags,
    });
  };

  return (
    <div className="min-h-screen bg-buoy-deep text-amber-50">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-buoy-glow">Breadcrumb</h1>
        <p className="mt-2 text-sm text-amber-50/60">
          Leave a trail the instant your attention drifts. Find your way back when you return.
        </p>

        {/* ── Session control ── */}
        <div className="mt-8">
          {focus ? (
            // Active session
            <div>
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-buoy-glow animate-pulse" />
                <span className="text-sm text-amber-50/70">
                  {focus.label
                    ? <>Active: <span className="text-buoy-glow">{focus.label}</span></>
                    : "Session in progress"}
                </span>
              </div>
              <button
                onClick={endSession}
                className="mt-4 rounded-lg bg-buoy-mist/40 px-5 py-2.5 text-sm font-medium text-amber-50 ring-1 ring-white/10 hover:bg-buoy-mist/60"
              >
                ⏸ End session
              </button>
            </div>
          ) : (
            // Start a session
            <div>
              <div className="flex gap-2">
                <input
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startSession(sessionInput)}
                  placeholder="optional: name this session"
                  className="flex-1 rounded-lg bg-buoy-mist/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-buoy-core/60"
                />
                <button
                  onClick={() => startSession(sessionInput)}
                  className="rounded-lg bg-buoy-core px-4 py-2 text-sm font-medium text-buoy-deep hover:brightness-110"
                >
                  ▶ Start
                </button>
              </div>

              {/* Recent focuses — one-tap resume */}
              {recentFocuses.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-amber-50/40">recent:</p>
                  <div className="flex flex-wrap gap-2">
                    {recentFocuses.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => startSession(f.label)}
                        className="rounded-full bg-buoy-mist/40 px-3 py-1 text-xs text-amber-50/70 ring-1 ring-white/10 hover:bg-buoy-mist/70 hover:text-amber-50"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── AI session naming suggestion ── */}
        {suggestedName && namingFocus && (
          <div className="mt-6 rounded-xl bg-buoy-mist/30 p-4 ring-1 ring-white/10">
            <p className="mb-2 text-xs text-amber-50/50">name this session?</p>
            {isEditingName ? (
              <div className="flex gap-2">
                <input
                  value={nameEditDraft}
                  onChange={(e) => setNameEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void confirmName(nameEditDraft);
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                  autoFocus
                  className="flex-1 rounded-lg bg-buoy-deep/70 px-3 py-1.5 text-sm text-amber-50 outline-none ring-1 ring-buoy-core/60"
                />
                <button
                  onClick={() => void confirmName(nameEditDraft)}
                  className="text-xs text-buoy-glow hover:text-amber-50"
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-amber-50/90">"{suggestedName}"</span>
                <button
                  onClick={() => void confirmName(suggestedName)}
                  className="text-xs text-buoy-glow hover:text-amber-50"
                >
                  ✓
                </button>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-xs text-amber-50/50 hover:text-amber-50"
                >
                  edit
                </button>
                <button
                  onClick={dismissName}
                  className="text-xs text-amber-50/30 hover:text-amber-50/60"
                >
                  skip
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-10 text-xs leading-relaxed text-amber-50/40">
          Switch away or go idle and Breadcrumb quietly drops a marker — no typing needed.
          Come back and the buoy offers a "where was I?" brief. Tap the buoy any time to add a
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
