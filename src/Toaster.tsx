// Toaster — the buoy-only UI shell.
//
// States (ToasterMode):
//   idle        → toaster bobs gently; focus chip shows beside it if a session is active
//   capture     → click: input pops in above toaster for quick note / idea
//   crumb-drop  → transient: particles fall from toaster body (auto-crumb or save)
//   return-peek → drift return: re-entry card springs up from below
//   history     → right-click: today's crumbs + recent sessions panel

import { useEffect, useRef, useState } from "react";
import type { Focus } from "./types";
import { History } from "./History";
import { getFlag, setFlag } from "./db";

export type ToasterMode = "idle" | "capture" | "crumb-drop" | "return-peek" | "history";

export interface ToasterProps {
  focusLabel?: string;
  hasActiveSession: boolean;
  isReturning: boolean;
  reentryText?: string;
  crumbDropTick: number;
  recentFocuses: Focus[];
  namingSuggestion?: string;
  onQuickNote: (text: string, asIdea: boolean) => Promise<void>;
  onDismissReturn: () => void;
  onStartSession: (label?: string) => Promise<void>;
  onEndSession: () => Promise<void>;
  onConfirmName: (name: string) => Promise<void>;
  onDismissName: () => void;
}

// ─── SVG toaster body ────────────────────────────────────────────────────────
// 72×72 viewBox, fills the 80×80 hit area (4px inset padding).
// The side lever is a separate interactive element — click opens History.
function ToasterSVG({ lit, onLeverClick }: { lit: boolean; onLeverClick?: () => void }) {
  const [leverHovered, setLeverHovered] = useState(false);
  const leverFill = leverHovered ? "#2D5230" : "#4A6B4D";

  return (
    <svg viewBox="0 0 72 72" width={72} height={72} fill="none" aria-hidden>
      {/* Drop shadow */}
      <ellipse cx="36" cy="65" rx="22" ry="3.5" fill="#1C1410" opacity="0.10" />

      {/* Feet */}
      <rect x="13" y="56" width="9" height="7" rx="3.5" fill="#C4914A" />
      <rect x="50" y="56" width="9" height="7" rx="3.5" fill="#C4914A" />

      {/* Body */}
      <rect x="6" y="18" width="60" height="39" rx="10" fill="#D9A85C" />

      {/* Top highlight stripe */}
      <rect x="11" y="23" width="50" height="3" rx="1.5" fill="#FAF7F0" opacity="0.28" />

      {/* Ventilation lines */}
      <rect x="11" y="34" width="32" height="1.5" rx=".75" fill="#C4914A" opacity="0.65" />
      <rect x="11" y="38.5" width="26" height="1.5" rx=".75" fill="#C4914A" opacity="0.65" />
      <rect x="11" y="43" width="20" height="1.5" rx=".75" fill="#C4914A" opacity="0.65" />

      {/* Dial (moss stroke — no fill) */}
      <circle cx="52" cy="38" r="5.5" stroke="#4A6B4D" strokeWidth="1.5" />
      <line x1="52" y1="33" x2="52" y2="35.5" stroke="#4A6B4D" strokeWidth="1.5" strokeLinecap="round" />

      {/* Lever — interactive: hover highlights, click opens History */}
      <g
        onClick={(e) => { e.stopPropagation(); onLeverClick?.(); }}
        onMouseEnter={() => setLeverHovered(true)}
        onMouseLeave={() => setLeverHovered(false)}
        style={{
          cursor: "pointer",
          animation: leverHovered ? "lever-jiggle 0.38s ease-in-out" : undefined,
        }}
      >
        {/* Wider transparent hit area for easier clicking */}
        <rect x="58" y="34" width="14" height="22" fill="transparent" />
        <rect x="63" y="40" width="3.5" height="11" rx="1.75" fill={leverFill} />
        <circle cx="64.75" cy="40" r="2.75" fill={leverFill} />
      </g>

      {/* Bread slots */}
      <rect x="14" y="5" width="14" height="18" rx="4" fill="#2D2010" />
      <rect x="44" y="5" width="14" height="18" rx="4" fill="#2D2010" />

      {/* Slot inner glint */}
      <rect x="17.5" y="8" width="4" height="10" rx="2" fill="#D9A85C" opacity={lit ? 0.45 : 0.15} />
      <rect x="47.5" y="8" width="4" height="10" rx="2" fill="#D9A85C" opacity={lit ? 0.45 : 0.15} />

      {/* Lit indicator dot (active session) */}
      {lit && <circle cx="25" cy="48" r="3" fill="#FAF7F0" opacity="0.55" />}
    </svg>
  );
}

// ─── Crumb-drop particles ─────────────────────────────────────────────────────
const PARTICLES = [
  { x: 18, delay: "0ms",   size: 2.5, color: "#D9A85C" },
  { x: 30, delay: "90ms",  size: 2,   color: "#C4914A" },
  { x: 44, delay: "50ms",  size: 2.5, color: "#D9A85C" },
  { x: 54, delay: "130ms", size: 1.5, color: "#C4914A" },
];

function CrumbParticles({ tick }: { tick: number }) {
  return (
    <div key={tick} className="absolute bottom-[72px] right-[4px] pointer-events-none w-[80px]">
      <svg viewBox="0 0 80 40" width={80} height={40} fill="none" aria-hidden>
        {PARTICLES.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={4}
            r={p.size}
            fill={p.color}
            style={{
              animation: `crumb-fall 0.65s ease-in ${p.delay} forwards`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── Capture input ────────────────────────────────────────────────────────────
function CaptureOverlay({
  onSave,
  onDismiss,
}: {
  onSave: (text: string, asIdea: boolean) => void;
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [asIdea, setAsIdea] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commit = () => {
    const t = draft.trim();
    if (t) onSave(t, asIdea);
    setDraft("");
    onDismiss();
  };

  return (
    <div className="animate-pop-in w-64 rounded-2xl bg-crumb-cream shadow-xl ring-1 ring-crumb-fog p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-crumb-moss">
          {asIdea ? "idea" : "breadcrumb"}
        </span>
        <button
          onClick={() => setAsIdea((v) => !v)}
          className="text-[10px] text-crumb-ink-dim hover:text-crumb-ink transition-colors"
        >
          {asIdea ? "→ breadcrumb" : "→ idea"}
        </button>
      </div>

      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onDismiss(); }
        }}
        placeholder={asIdea ? "what's the spark?" : "what are you mid-doing?"}
        className="w-full rounded-lg bg-crumb-fog/50 px-3 py-2 text-sm text-crumb-ink placeholder:text-crumb-ink-dim outline-none ring-1 ring-crumb-fog focus:ring-crumb-gold/60 transition-shadow"
      />
      <p className="mt-1.5 text-[9px] text-crumb-ink-dim/70">Enter to save · Esc to dismiss</p>
    </div>
  );
}

// ─── Return card ─────────────────────────────────────────────────────────────
function ReturnCard({
  text,
  onGotIt,
  onAddNote,
}: {
  text: string;
  onGotIt: () => void;
  onAddNote: () => void;
}) {
  return (
    <div className="animate-peek-in w-64 rounded-2xl bg-crumb-cream shadow-xl ring-1 ring-crumb-gold/30 p-4">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-crumb-gold">
        where was i?
      </p>
      <p className="text-sm leading-snug text-crumb-ink line-clamp-4 break-words">{text}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onGotIt}
          className="rounded-lg bg-crumb-gold px-3 py-1.5 text-xs font-semibold text-crumb-cream hover:bg-crumb-gold-dim transition-colors"
        >
          Got it
        </button>
        <button
          onClick={onAddNote}
          className="rounded-lg bg-crumb-fog px-3 py-1.5 text-xs text-crumb-ink-dim hover:text-crumb-ink transition-colors"
        >
          Add a note
        </button>
      </div>
    </div>
  );
}

// ─── AI name suggestion banner ────────────────────────────────────────────────
function NamingBanner({
  suggestion,
  onConfirm,
  onDismiss,
}: {
  suggestion: string;
  onConfirm: (s: string) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion);

  return (
    <div className="animate-fade-in w-64 rounded-2xl bg-crumb-cream shadow-xl ring-1 ring-crumb-fog p-3">
      <p className="mb-2 text-[10px] text-crumb-ink-dim uppercase tracking-wide">name this session?</p>
      {editing ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(draft);
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="flex-1 rounded-lg bg-crumb-fog/60 px-2 py-1 text-sm text-crumb-ink outline-none ring-1 ring-crumb-gold/60"
          />
          <button onClick={() => onConfirm(draft)} className="text-xs text-crumb-gold font-semibold">✓</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-crumb-ink">"{suggestion}"</span>
          <button onClick={() => onConfirm(suggestion)} className="text-xs font-semibold text-crumb-gold hover:text-crumb-gold-dim">✓</button>
          <button onClick={() => setEditing(true)} className="text-xs text-crumb-ink-dim hover:text-crumb-ink">edit</button>
          <button onClick={onDismiss} className="text-xs text-crumb-ink-dim/50 hover:text-crumb-ink-dim">skip</button>
        </div>
      )}
    </div>
  );
}

// ─── Dynamic window sizing ────────────────────────────────────────────────────
// Sizes (logical px): window grows to fit each mode, re-anchored to bottom-right.
const MODE_SIZES: Record<ToasterMode, [number, number]> = {
  idle:           [280, 100],
  "crumb-drop":   [280, 100],
  capture:        [280, 240],
  "return-peek":  [280, 320],
  history:        [280, 480],
};

async function resizeAnchored(w: number, h: number): Promise<void> {
  // @ts-expect-error injected by Tauri at runtime
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return;
  try {
    const [{ getCurrentWindow }, { LogicalSize, LogicalPosition }] = await Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/api/dpi"),
    ]);
    const win = getCurrentWindow();
    const margin = 16;
    const sw = window.screen.width;
    const sh = window.screen.height;
    await win.setPosition(new LogicalPosition(sw - w - margin, sh - h - margin));
    await win.setSize(new LogicalSize(w, h));
  } catch {
    // not in Tauri or permission denied — silently skip
  }
}

// ─── Main Toaster component ───────────────────────────────────────────────────
export function Toaster({
  focusLabel,
  hasActiveSession,
  isReturning,
  reentryText,
  crumbDropTick,
  recentFocuses,
  namingSuggestion,
  onQuickNote,
  onDismissReturn,
  onStartSession,
  onEndSession,
  onConfirmName,
  onDismissName,
}: ToasterProps) {
  const [mode, setMode] = useState<ToasterMode>("idle");
  const prevTickRef = useRef(crumbDropTick);
  const [hintVisible, setHintVisible] = useState(false);

  // Show first-run hint once, auto-dismiss after 5 s, persist flag in IDB.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    getFlag("hint-shown").then((seen) => {
      if (seen) return;
      setHintVisible(true);
      timer = setTimeout(() => {
        setHintVisible(false);
        void setFlag("hint-shown", true);
      }, 5000);
    });
    return () => clearTimeout(timer);
  }, []);

  // Resize & re-anchor window whenever mode or overlays change.
  useEffect(() => {
    let [w, h] = MODE_SIZES[mode];
    if (namingSuggestion && (mode === "idle" || mode === "crumb-drop")) h = 220;
    if (hintVisible && mode === "idle") h = Math.max(h, 160);
    void resizeAnchored(w, h);
  }, [mode, namingSuggestion, hintVisible]);

  // Drive mode from parent state changes
  useEffect(() => {
    if (isReturning && mode !== "return-peek") {
      setMode("return-peek");
    }
  }, [isReturning]);

  // Crumb-drop: fire animation on each tick, return to idle after
  useEffect(() => {
    if (crumbDropTick === prevTickRef.current) return;
    prevTickRef.current = crumbDropTick;
    if (mode === "idle") {
      setMode("crumb-drop");
      setTimeout(() => setMode("idle"), 750);
    }
  }, [crumbDropTick]);

  const openCapture = () => {
    if (mode === "idle" || mode === "crumb-drop") setMode("capture");
  };

  const dismissCapture = () => setMode("idle");

  const handleSave = async (text: string, asIdea: boolean) => {
    await onQuickNote(text, asIdea);
    setMode("crumb-drop");
    setTimeout(() => setMode("idle"), 750);
  };

  const handleGotIt = () => {
    onDismissReturn();
    setMode("idle");
  };

  const handleAddNoteFromReturn = () => {
    onDismissReturn();
    setMode("capture");
  };

  const handleLeverClick = () => {
    setMode((prev) => (prev === "history" ? "idle" : "history"));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMode((prev) => (prev === "history" ? "idle" : "history"));
  };

  const isCapturing = mode === "capture";
  const isReturn = mode === "return-peek";
  const isHistory = mode === "history";
  const dropping = mode === "crumb-drop";

  return (
    // Opaque cream window — sized exactly to visible content by resizeAnchored().
    <div className="w-full h-full relative overflow-hidden">
      {/* All overlays anchor from bottom-right corner */}
      <div className="absolute bottom-[96px] right-2 flex flex-col items-end gap-2">

        {/* First-run hint — auto-dismisses after 5 s, never shows again */}
        {hintVisible && mode === "idle" && (
          <div className="animate-fade-in rounded-xl bg-crumb-ink/85 px-3.5 py-2.5 shadow-lg w-64">
            <p className="text-[11px] text-crumb-cream/90 leading-snug">
              click me to drop a note
            </p>
            <p className="text-[11px] text-crumb-cream/55 leading-snug mt-0.5">
              pull the lever for history
            </p>
          </div>
        )}

        {/* Naming suggestion (shows above other overlays) */}
        {namingSuggestion && !isCapturing && !isReturn && !isHistory && (
          <NamingBanner
            suggestion={namingSuggestion}
            onConfirm={onConfirmName}
            onDismiss={onDismissName}
          />
        )}

        {/* Overlays — only one shows at a time */}
        {isCapturing && (
          <CaptureOverlay onSave={handleSave} onDismiss={dismissCapture} />
        )}

        {isReturn && reentryText && (
          <ReturnCard
            text={reentryText}
            onGotIt={handleGotIt}
            onAddNote={handleAddNoteFromReturn}
          />
        )}

        {isHistory && (
          <History
            recentFocuses={recentFocuses}
            onStartSession={async (label) => {
              await onStartSession(label);
              setMode("idle");
            }}
            onEndSession={async () => {
              await onEndSession();
              setMode("idle");
            }}
            hasActiveSession={hasActiveSession}
            focusLabel={focusLabel}
            onClose={() => setMode("idle")}
          />
        )}
      </div>

      {/* Focus label chip — shows in idle next to the toaster */}
      {focusLabel && mode === "idle" && (
        <div className="absolute bottom-[22px] right-[92px]">
          <div className="rounded-full bg-crumb-cream/90 px-3 py-1 text-xs text-crumb-ink shadow ring-1 ring-crumb-fog max-w-[160px] truncate">
            → {focusLabel}
          </div>
        </div>
      )}

      {/* Crumb-drop particles */}
      {dropping && <CrumbParticles tick={crumbDropTick} />}

      {/* The toaster itself — always visible, bottom-right */}
      <button
        aria-label={mode === "capture" ? "dismiss capture" : "open capture"}
        onClick={() => (isCapturing ? dismissCapture() : openCapture())}
        onContextMenu={handleContextMenu}
        className={[
          "absolute bottom-2 right-2 w-20 h-20",
          "flex items-center justify-center",
          "rounded-full focus:outline-none",
          // Pulse ring when in capture mode
          isCapturing
            ? "ring-2 ring-crumb-gold/60 ring-offset-0 animate-ring-pulse"
            : "",
        ].join(" ")}
      >
        <div className={mode === "idle" ? "animate-bob" : ""}>
          <ToasterSVG lit={hasActiveSession} onLeverClick={handleLeverClick} />
        </div>
      </button>
    </div>
  );
}
