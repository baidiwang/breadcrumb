// Toaster — the buoy-only UI shell.
//
// States (ToasterMode):
//   idle        → small 140×144 window, just the toaster character
//   capture     → input card pops in; window expands
//   crumb-drop  → transient: particles fall, lever jiggles once
//   return-peek → re-entry card; window expands; auto-dismisses after 12 s
//   history     → date + crumb count + jump-back list; window expands

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

// ─── SVG toaster character ───────────────────────────────────────────────────
// 168×184 viewBox rendered at 112×123. Toast slice pops on capture/return,
// leans on return-peek. Crumbs animate inside the SVG from the slice base.
// Lever (gold) lifts when popped and jiggles once after each crumb drop.

const CRUMB_DEFS = [
  { id: 0, dx: -14, dy: 30, delay: 0 },
  { id: 1, dx:   2, dy: 34, delay: 85 },
  { id: 2, dx:  -6, dy: 26, delay: 50 },
  { id: 3, dx:  14, dy: 32, delay: 130 },
];

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function ToasterSVG({
  lit,
  onLeverClick,
  jiggling,
  popped,
  leaning,
  showCrumbs,
  crumbKey,
}: {
  lit: boolean;
  onLeverClick?: () => void;
  jiggling?: boolean;
  popped?: boolean;
  leaning?: boolean;
  showCrumbs?: boolean;
  crumbKey?: number;
}) {
  const [leverHovered, setLeverHovered] = useState(false);
  const leverFill = leverHovered ? "#E8C170" : "#D9A85C";

  return (
    <svg
      viewBox="0 0 168 184"
      width={96}
      height={105}
      fill="none"
      aria-hidden
      style={{ overflow: "visible" }}
    >
      {/* ground shadow */}
      <ellipse cx="84" cy="169" rx="60" ry="7" fill="#4A6B4D" opacity="0.1" />

      {/* grass tufts */}
      <g stroke="#4A6B4D" strokeWidth="2.4" strokeLinecap="round" opacity="0.45">
        <path d="M24 168c4-9 5-15 4-21" />
        <path d="M34 168c1-8 4-13 9-17" />
        <path d="M144 168c-4-9-5-14-4-20" />
        <path d="M134 168c-1-7-4-12-9-16" />
      </g>

      {/* toast slice — pops up on capture/return, leans on return-peek */}
      <g
        style={{
          transform: popped
            ? leaning
              ? "translateY(-40px) rotate(-11deg)"
              : "translateY(-46px) rotate(2deg)"
            : "translateY(0) rotate(0deg)",
          transformOrigin: "84px 120px",
          transition: `transform 0.62s ${SPRING}`,
        }}
      >
        <g className={popped ? "" : "animate-breathe"}>
          {/* bread shape */}
          <path
            d="M60 66c0-9 5-14 12-14h24c7 0 12 5 12 14v52H60z"
            fill="#E8D5A8"
            stroke="#4A6B4D"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          {/* crust highlight */}
          <path d="M66 74c0-5 3-8 8-8h20c5 0 8 3 8 8v10H66z" fill="#D9A85C" opacity="0.55" />
          {/* eyes */}
          <circle cx="75" cy="90" r="3" fill="#4A6B4D" />
          <circle cx="93" cy="90" r="3" fill="#4A6B4D" />
          {/* mouth — wider smile when popped */}
          <path
            d={popped ? "M76 99q8 8 16 0" : "M77 99q7 5 14 0"}
            stroke="#4A6B4D"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
          {/* cheek blush */}
          <circle cx="68" cy="97" r="3.4" fill="#C4914A" opacity="0.35" />
          <circle cx="100" cy="97" r="3.4" fill="#C4914A" opacity="0.35" />
        </g>

        {/* crumbs — originate from slice base, animate on drop */}
        {showCrumbs && CRUMB_DEFS.map((c) => (
          <rect
            key={`${crumbKey}-${c.id}`}
            x="80" y="114" width="5" height="5" rx="1.6"
            fill="#C4914A"
            style={{
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              animation: `crumb-fall-2d 1.15s ease-in ${c.delay}ms both`,
            } as React.CSSProperties}
          />
        ))}
      </g>

      {/* toaster body */}
      <rect x="26" y="104" width="116" height="62" rx="22" fill="#D9A85C" stroke="#4A6B4D" strokeWidth="3.4" />
      {/* bread slot — glows brighter when session is active */}
      <rect x="56" y="112" width="56" height="9" rx="4.5" fill="#4A6B4D" opacity={lit ? 0.85 : 0.65} />
      {/* dial */}
      <circle cx="124" cy="140" r="7.5" fill="#FAF7F0" stroke="#4A6B4D" strokeWidth="3" />
      {/* vent */}
      <rect x="40" y="134" width="26" height="6" rx="3" fill="#FAF7F0" opacity="0.75" />

      {/* lever position wrapper — moves up when toast pops */}
      <g style={{ transform: popped ? "translateY(-9px)" : "translateY(0)", transition: `transform 0.5s ${SPRING}` }}>
        {/* jiggle + interaction group */}
        <g
          onClick={(e) => { e.stopPropagation(); onLeverClick?.(); }}
          onMouseEnter={() => setLeverHovered(true)}
          onMouseLeave={() => setLeverHovered(false)}
          style={{ cursor: "pointer", animation: jiggling ? "lever-jiggle 0.4s ease-in-out" : undefined }}
        >
          {/* wider transparent hit area */}
          <rect x="138" y="118" width="24" height="32" fill="transparent" />
          <rect x="146" y="126" width="8" height="20" rx="4" fill={leverFill} />
        </g>
      </g>

      {/* feet */}
      <rect x="42" y="160" width="16" height="10" rx="4" fill="#4A6B4D" opacity="0.85" />
      <rect x="110" y="160" width="16" height="10" rx="4" fill="#4A6B4D" opacity="0.85" />

      {/* resting crumbs at base */}
      <g fill="#C4914A" opacity="0.8">
        <rect x="18" y="166" width="5" height="4" rx="1.5" transform="rotate(-18 18 166)" />
        <rect x="34" y="170" width="4" height="4" rx="1.4" transform="rotate(24 34 170)" />
        <rect x="146" y="168" width="5" height="4" rx="1.5" transform="rotate(12 146 168)" />
        <rect x="132" y="172" width="4" height="4" rx="1.4" transform="rotate(-30 132 172)" />
      </g>
    </svg>
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
        <span className="font-heading text-[10px] font-semibold uppercase tracking-wider text-crumb-moss">
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
// Auto-dismisses after 12 s with a gentle fade. "Got it" closes early.
// "Add a note" removed — clicking the toaster is the note path.
function ReturnCard({ text, onGotIt }: { text: string; onGotIt: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setFading(true);
      setTimeout(onGotIt, 700);
    }, 12_000);
    return () => clearTimeout(t);
  }, [onGotIt]);

  return (
    <div
      className={[
        "animate-peek-in w-64 rounded-2xl bg-crumb-cream shadow-xl ring-1 ring-crumb-gold/30 p-4",
        "transition-opacity duration-700",
        fading ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <p className="font-heading mb-1 text-[10px] font-semibold uppercase tracking-wider text-crumb-gold">
        where was i?
      </p>
      <p className="text-sm leading-snug text-crumb-ink line-clamp-4 break-words">{text}</p>
      <div className="mt-3">
        <button
          onClick={onGotIt}
          className="rounded-lg bg-crumb-gold px-3 py-1.5 text-xs font-semibold text-crumb-cream hover:bg-crumb-gold-dim transition-colors"
        >
          Got it
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
// Sizes (logical px): idle is tiny; window grows to fit open cards only.
const MODE_SIZES: Record<ToasterMode, [number, number]> = {
  idle:           [120, 122],
  "crumb-drop":   [120, 122],
  capture:        [280, 260],
  "return-peek":  [280, 300],
  history:        [280, 400],
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
  focusLabel: _focusLabel,
  hasActiveSession,
  isReturning,
  reentryText,
  crumbDropTick,
  recentFocuses,
  namingSuggestion,
  onQuickNote,
  onDismissReturn,
  onStartSession,
  onEndSession: _onEndSession,
  onConfirmName,
  onDismissName,
}: ToasterProps) {
  const [mode, setMode] = useState<ToasterMode>("idle");
  const prevTickRef = useRef(crumbDropTick);
  const [leverJiggling, setLeverJiggling] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  // Show first-run hint once; auto-dismiss after 5 s; persist flag in IDB.
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

  // Resize + re-anchor whenever mode or transient overlays change.
  useEffect(() => {
    let [w, h] = MODE_SIZES[mode];
    if (namingSuggestion && (mode === "idle" || mode === "crumb-drop")) { w = 280; h = 250; }
    if (hintVisible && mode === "idle") { w = 280; h = 200; }
    void resizeAnchored(w, h);
  }, [mode, namingSuggestion, hintVisible]);

  // Drive mode from parent return-state.
  useEffect(() => {
    if (isReturning && mode !== "return-peek") setMode("return-peek");
  }, [isReturning]);

  // Crumb-drop: jiggle lever once, play particle animation, return to idle.
  useEffect(() => {
    if (crumbDropTick === prevTickRef.current) return;
    prevTickRef.current = crumbDropTick;
    if (mode === "idle") {
      setMode("crumb-drop");
      setLeverJiggling(true);
      const t = setTimeout(() => { setMode("idle"); setLeverJiggling(false); }, 750);
      return () => clearTimeout(t);
    }
  }, [crumbDropTick]); // mode is intentionally read via closure — only fires from idle

  // Clicking the toaster: if returning, dismiss card and open capture; otherwise toggle capture.
  const openCapture = () => {
    if (mode === "return-peek") {
      onDismissReturn();
      setMode("capture");
    } else if (mode === "idle" || mode === "crumb-drop") {
      setMode("capture");
    }
  };

  const dismissCapture = () => setMode("idle");

  const handleSave = async (text: string, asIdea: boolean) => {
    await onQuickNote(text, asIdea);
    setMode("crumb-drop");
    setLeverJiggling(true);
    setTimeout(() => { setMode("idle"); setLeverJiggling(false); }, 750);
  };

  const handleGotIt = () => { onDismissReturn(); setMode("idle"); };

  const handleLeverClick = () => setMode((prev) => (prev === "history" ? "idle" : "history"));

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMode((prev) => (prev === "history" ? "idle" : "history"));
  };

  const isCapturing = mode === "capture";
  const isReturn    = mode === "return-peek";
  const isHistory   = mode === "history";
  const dropping    = mode === "crumb-drop";

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Overlays — anchor from bottom-right corner, stack upward */}
      <div className="absolute bottom-[116px] right-2 flex flex-col items-end gap-2">

        {/* First-run hint — auto-dismisses after 5 s */}
        {hintVisible && mode === "idle" && (
          <div className="animate-fade-in rounded-xl bg-crumb-ink/85 px-3.5 py-2.5 shadow-lg w-64">
            <p className="text-[11px] text-crumb-cream/90 leading-snug">click me to drop a note</p>
            <p className="text-[11px] text-crumb-cream/55 leading-snug mt-0.5">pull the lever for history</p>
          </div>
        )}

        {/* AI naming banner */}
        {namingSuggestion && !isCapturing && !isReturn && !isHistory && (
          <NamingBanner
            suggestion={namingSuggestion}
            onConfirm={onConfirmName}
            onDismiss={onDismissName}
          />
        )}

        {isCapturing && <CaptureOverlay onSave={handleSave} onDismiss={dismissCapture} />}

        {isReturn && reentryText && (
          <ReturnCard text={reentryText} onGotIt={handleGotIt} />
        )}

        {isHistory && (
          <History
            recentFocuses={recentFocuses}
            onStartSession={async (label) => { await onStartSession(label); setMode("idle"); }}
            onClose={() => setMode("idle")}
          />
        )}
      </div>

      {/* The toaster character — lift+brighten on hover; crumbs embedded in SVG */}
      <button
        aria-label={isCapturing ? "dismiss capture" : "open capture"}
        onClick={() => (isCapturing ? dismissCapture() : openCapture())}
        onContextMenu={handleContextMenu}
        className={[
          "absolute bottom-2 right-2 w-[96px] h-[105px]",
          "flex items-center justify-center",
          "rounded-3xl focus:outline-none",
          "transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110",
          isCapturing ? "ring-2 ring-crumb-gold/60 ring-offset-0 animate-ring-pulse" : "",
        ].join(" ")}
      >
        <ToasterSVG
          lit={hasActiveSession}
          onLeverClick={handleLeverClick}
          jiggling={leverJiggling}
          popped={isCapturing || isReturn}
          leaning={isReturn}
          showCrumbs={dropping}
          crumbKey={crumbDropTick}
        />
      </button>
    </div>
  );
}
