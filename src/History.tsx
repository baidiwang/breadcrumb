// History panel — shown on right-click of the toaster.
// Displays: today's crumb count, recent focus sessions (one-tap resume),
// end-session control if active, +Label prompt if active session is unlabeled.

import { useEffect, useState } from "react";
import { recentBreadcrumbs } from "./db";
import type { Focus } from "./types";

interface HistoryProps {
  recentFocuses: Focus[];
  hasActiveSession: boolean;
  focusLabel?: string;
  onStartSession: (label?: string) => Promise<void>;
  onEndSession: () => Promise<void>;
  onClose: () => void;
}

export function History({
  recentFocuses,
  hasActiveSession,
  focusLabel,
  onStartSession,
  onEndSession,
  onClose,
}: HistoryProps) {
  const [todayCount, setTodayCount] = useState(0);
  const [labelDraft, setLabelDraft] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);

  useEffect(() => {
    recentBreadcrumbs(200).then((crumbs) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      setTodayCount(crumbs.filter((c) => c.createdAt >= startOfDay.getTime()).length);
    });
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="animate-pop-in w-64 rounded-2xl bg-crumb-cream shadow-xl ring-1 ring-crumb-fog overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-crumb-fog">
        <div>
          <p className="text-xs font-semibold text-crumb-ink">{today}</p>
          <p className="text-[10px] text-crumb-ink-dim mt-0.5">
            {todayCount === 0
              ? "no crumbs yet today"
              : `${todayCount} crumb${todayCount !== 1 ? "s" : ""} today`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="close history"
          className="text-crumb-ink-dim hover:text-crumb-ink transition-colors text-sm leading-none"
        >
          ×
        </button>
      </div>

      {/* Active session controls */}
      {hasActiveSession && (
        <div className="px-4 py-2.5 border-b border-crumb-fog bg-crumb-gold/10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-crumb-gold font-semibold">Active</p>
              <p className="text-xs text-crumb-ink truncate mt-0.5">
                {focusLabel ?? <span className="text-crumb-ink-dim italic">unlabeled session</span>}
              </p>
            </div>
            <button
              onClick={onEndSession}
              className="ml-2 flex-shrink-0 rounded-lg bg-crumb-fog px-2.5 py-1 text-[10px] font-medium text-crumb-ink-dim hover:text-crumb-ink transition-colors"
            >
              ⏸ end
            </button>
          </div>

          {/* +Label for unlabeled session */}
          {!focusLabel && (
            <div className="mt-2">
              {showLabelInput ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && labelDraft.trim()) {
                      onStartSession(labelDraft.trim());
                      setShowLabelInput(false);
                      setLabelDraft("");
                    }
                    if (e.key === "Escape") setShowLabelInput(false);
                  }}
                  placeholder="name this session…"
                  className="w-full rounded-lg bg-crumb-fog/60 px-2 py-1 text-xs text-crumb-ink placeholder:text-crumb-ink-dim outline-none ring-1 ring-crumb-gold/50"
                />
              ) : (
                <button
                  onClick={() => setShowLabelInput(true)}
                  className="text-[10px] text-crumb-moss hover:text-crumb-ink transition-colors"
                >
                  + Label this session
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Jump back in list */}
      {recentFocuses.length > 0 && (
        <div className="px-4 pt-2.5 pb-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-crumb-ink-dim font-medium">
            Jump back in
          </p>
          <ul className="space-y-1">
            {recentFocuses.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => onStartSession(f.label)}
                  className="w-full text-left group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-crumb-gold/15 transition-colors"
                >
                  <span className="text-crumb-gold text-xs opacity-60 group-hover:opacity-100">→</span>
                  <span className="text-xs text-crumb-ink truncate">
                    {f.label ?? <span className="text-crumb-ink-dim italic">unlabeled</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasActiveSession && recentFocuses.length === 0 && (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-crumb-ink-dim">
            Click the toaster to start capturing.
          </p>
        </div>
      )}

      {/* Start new session */}
      {!hasActiveSession && (
        <div className="px-4 pb-3 border-t border-crumb-fog pt-2.5">
          <button
            onClick={() => onStartSession()}
            className="w-full rounded-lg bg-crumb-gold py-1.5 text-xs font-semibold text-crumb-cream hover:bg-crumb-gold-dim transition-colors"
          >
            ▶ Start new session
          </button>
        </div>
      )}
    </div>
  );
}
