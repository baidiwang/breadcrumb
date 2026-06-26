// The buoy itself — a warm, breathing floating object.
// States: idle (breathing dot) / capture (fast note field) / return (gentle pulse + re-entry).
// Capture is built for speed: auto-focus, Enter saves, Esc dismisses.

import { useEffect, useRef, useState } from "react";

type Mode = "idle" | "capture" | "return";

type Props = {
  focusLabel?: string;
  isReturning: boolean; // drift hook says we just came back
  reentryText?: string; // generated brief (or fallback)
  onQuickNote: (text: string, asIdea: boolean) => void;
  onDismissReturn: () => void;
};

export function Buoy({
  focusLabel,
  isReturning,
  reentryText,
  onQuickNote,
  onDismissReturn,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState("");
  const [asIdea, setAsIdea] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // surface the return state when drift detection fires
  useEffect(() => {
    if (isReturning) setMode("return");
  }, [isReturning]);

  // autofocus the field the instant capture opens
  useEffect(() => {
    if (mode === "capture") inputRef.current?.focus();
  }, [mode]);

  const openCapture = (idea = false) => {
    setAsIdea(idea);
    setMode("capture");
  };

  const commit = () => {
    const t = draft.trim();
    if (t) onQuickNote(t, asIdea);
    setDraft("");
    setMode("idle");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft("");
      setMode("idle");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] select-none font-sans">
      {/* RETURN: gentle re-entry card */}
      {mode === "return" && (
        <div className="mb-3 w-72 rounded-2xl bg-buoy-mist/95 p-4 text-sm text-amber-50 shadow-xl backdrop-blur">
          <div className="mb-1 text-xs uppercase tracking-wide text-buoy-glow/80">
            where was i?
          </div>
          <p className="leading-relaxed text-amber-50/90">
            {reentryText ?? "Welcome back. Pulling your breadcrumbs together…"}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-lg bg-buoy-core/90 px-3 py-1 text-xs font-medium text-buoy-deep hover:bg-buoy-core"
              onClick={() => {
                onDismissReturn();
                setMode("idle");
              }}
            >
              Got it
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-1 text-xs text-amber-50/80 hover:bg-white/20"
              onClick={() => openCapture(false)}
            >
              Add a note
            </button>
          </div>
        </div>
      )}

      {/* CAPTURE: ultra-fast note field */}
      {mode === "capture" && (
        <div className="mb-3 w-72 rounded-2xl bg-buoy-mist/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-buoy-glow/80">
              {asIdea ? "idea" : "breadcrumb"}
            </span>
            <button
              className="text-xs text-amber-50/50 hover:text-amber-50"
              onClick={() => setAsIdea((v) => !v)}
            >
              {asIdea ? "→ make breadcrumb" : "→ make idea"}
            </button>
          </div>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={asIdea ? "what's the spark?" : "what are you mid-doing?"}
            className="w-full rounded-lg bg-buoy-deep/70 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-50/30 outline-none ring-1 ring-white/10 focus:ring-buoy-core/60"
          />
          <div className="mt-2 text-[10px] text-amber-50/40">
            Enter to save · Esc to dismiss
          </div>
        </div>
      )}

      {/* IDLE / always-present buoy */}
      <div className="flex items-center justify-end gap-2">
        {focusLabel && mode === "idle" && (
          <div className="max-w-[180px] truncate rounded-full bg-buoy-mist/80 px-3 py-1 text-xs text-amber-50/80 shadow backdrop-blur">
            → {focusLabel}
          </div>
        )}
        <button
          aria-label="breadcrumb"
          onClick={() => (mode === "idle" ? openCapture(false) : setMode("idle"))}
          className={[
            "relative h-12 w-12 rounded-full",
            "bg-gradient-to-br from-buoy-glow to-buoy-core",
            "shadow-lg ring-2 ring-white/20",
            mode === "return" ? "animate-pulse-soft" : "animate-breathe",
          ].join(" ")}
        >
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-buoy-deep">
            {/* tiny crumb glyph */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="4" cy="4" r="1.6" />
              <circle cx="9" cy="6" r="1.3" />
              <circle cx="6" cy="10" r="1.1" />
              <circle cx="11" cy="11" r="1.6" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
