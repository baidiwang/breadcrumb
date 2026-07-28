// History panel — date header, today's crumb count, and "Jump back in" list.
// Active-session controls removed; end/label/start buttons all gone.

import { useEffect, useState } from "react";
import { recentBreadcrumbs } from "./db";
import type { Focus } from "./types";

interface HistoryProps {
  recentFocuses: Focus[];
  onStartSession: (label?: string) => Promise<void>;
  onClose: () => void;
}

export function History({ recentFocuses, onStartSession, onClose }: HistoryProps) {
  const [todayCount, setTodayCount] = useState(0);

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

      {/* Jump back in */}
      {recentFocuses.length > 0 ? (
        <div className="px-4 pt-2.5 pb-3">
          <p className="font-heading mb-1.5 text-[10px] uppercase tracking-wide text-crumb-ink-dim font-medium">
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
      ) : (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-crumb-ink-dim">Click the toaster to start capturing.</p>
        </div>
      )}
    </div>
  );
}
