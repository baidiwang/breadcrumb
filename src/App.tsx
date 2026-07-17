// App — buoy-only mode.
// All state management lives here; the Toaster is the sole visible surface.
// No page layout, no input forms — the window is a transparent 320×420 overlay.

import { useEffect, useRef, useState } from "react";
import { Toaster } from "./Toaster";
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
  const [focus, setFocus]                   = useState<Focus | undefined>();
  const [recentFocuses, setRecentFocuses]   = useState<Focus[]>([]);
  const [isReturning, setIsReturning]       = useState(false);
  const [reentryText, setReentryText]       = useState<string | undefined>();
  const [crumbDropTick, setCrumbDropTick]   = useState(0);

  // AI session naming
  const [namingFocus, setNamingFocus]       = useState<Focus | undefined>();
  const [suggestedName, setSuggestedName]   = useState<string | undefined>();

  // Use a ref to always read the latest focus inside async callbacks
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const namingFocusRef = useRef(namingFocus);
  namingFocusRef.current = namingFocus;

  useEffect(() => {
    getActiveFocus().then(setFocus);
    void refreshRecent();
  }, []);

  const refreshRecent = async () => {
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

  // Global shortcut — opens capture from anywhere (desktop)
  useEffect(() => {
    const cleanup = registerGlobalShortcuts(() => {
      window.dispatchEvent(new CustomEvent("breadcrumb:capture"));
    });
    return () => void cleanup?.then?.((c) => c?.());
  }, []);

  // --- AI session naming ---
  const tryNameSession = async (f: Focus, crumbs: Breadcrumb[]) => {
    if (namingFocusRef.current) return; // already pending
    const name = await suggestSessionName(crumbs).catch(() => "");
    if (!name) return;
    setNamingFocus(f);
    setSuggestedName(name);
  };

  // --- Drift detection: the zero-friction core ---
  useDriftDetection({
    onLeave: async () => {
      const f = focusRef.current;
      await saveBreadcrumb({
        id: uid(),
        createdAt: Date.now(),
        focusId: f?.id,
        trigger: "auto-leave",
        kind: "breadcrumb",
      });
      setCrumbDropTick((t) => t + 1);
    },
    onReturn: async (sig: DriftSignal) => {
      const f = focusRef.current;
      const marker: Breadcrumb = {
        id: uid(),
        createdAt: Date.now(),
        focusId: f?.id,
        trigger: "auto-idle",
        kind: "breadcrumb",
        signal: { awayMs: sig.awayMs, foregroundApp: sig.foregroundApp },
      };
      await saveBreadcrumb(marker);

      const crumbs = f ? await breadcrumbsForFocus(f.id) : [];
      const text = await reentryBrief(f, crumbs);
      setReentryText(text);
      if (f) {
        await saveBrief({ id: uid(), focusId: f.id, generatedAt: Date.now(), text });
        if (!f.label && crumbs.length > 0) void tryNameSession(f, crumbs);
      }
      setIsReturning(true);
    },
  });

  // --- Session lifecycle ---
  const startSession = async (label?: string) => {
    const trimmed = label?.trim() || undefined;
    const f = focusRef.current;
    if (f) await saveFocus({ ...f, status: "parked", endedAt: Date.now() });
    const next: Focus = { id: uid(), label: trimmed, startedAt: Date.now(), status: "active" };
    await saveFocus(next);
    setFocus(next);
    setNamingFocus(undefined);
    setSuggestedName(undefined);
    void refreshRecent();
  };

  const endSession = async () => {
    const f = focusRef.current;
    if (!f) return;
    const ended: Focus = { ...f, status: "done", endedAt: Date.now() };
    await saveFocus(ended);
    setFocus(undefined);
    void refreshRecent();
    if (!ended.label) {
      const crumbs = await breadcrumbsForFocus(ended.id);
      if (crumbs.length > 0) void tryNameSession(ended, crumbs);
    }
  };

  // --- Name confirmation ---
  const confirmName = async (name: string) => {
    const nf = namingFocusRef.current;
    if (!nf || !name.trim()) { dismissName(); return; }
    const updated = { ...nf, label: name.trim() };
    await saveFocus(updated);
    if (focusRef.current?.id === nf.id) setFocus(updated);
    setNamingFocus(undefined);
    setSuggestedName(undefined);
    void refreshRecent();
  };

  const dismissName = () => {
    setNamingFocus(undefined);
    setSuggestedName(undefined);
  };

  // --- Quick note ---
  const onQuickNote = async (text: string, asIdea: boolean) => {
    const f = focusRef.current;
    const { kind, tags } = asIdea
      ? { kind: "idea" as const, tags: [] }
      : await classify(text, f?.label);
    await saveBreadcrumb({
      id: uid(),
      createdAt: Date.now(),
      focusId: asIdea ? undefined : f?.id,
      text,
      trigger: asIdea ? "idea" : "manual",
      kind: asIdea ? "idea" : kind,
      tags,
    });
    setCrumbDropTick((t) => t + 1);
  };

  return (
    <Toaster
      focusLabel={focus?.label}
      hasActiveSession={!!focus}
      isReturning={isReturning}
      reentryText={reentryText}
      crumbDropTick={crumbDropTick}
      recentFocuses={recentFocuses}
      namingSuggestion={namingFocus ? suggestedName : undefined}
      onQuickNote={onQuickNote}
      onDismissReturn={() => setIsReturning(false)}
      onStartSession={startSession}
      onEndSession={endSession}
      onConfirmName={confirmName}
      onDismissName={dismissName}
    />
  );
}
