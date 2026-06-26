# 🍞 Breadcrumb

**A low-friction working-memory companion for ADHD brains.**
Leave a trail the instant your attention drifts — find your way back when you return.

Breadcrumb is a small, warm buoy that floats at the edge of your screen. When you
switch away from what you were doing, it quietly drops a marker — **no typing
needed**. When you come back, it offers a gentle "where was I?" brief that
reconstructs what you were doing, where you paused, and what comes next.

> Built from a real personal pain point: starting task A, glancing at task B, and
> losing A entirely. Breadcrumb's whole job is to get you back to A.

---

## Why it's designed this way

Breadcrumb is **not** a surveillance tool. It does not read your screen or your
window contents. Instead it's an *externalized working memory*:

- **Zero-friction capture.** The hardest moment for an ADHD brain isn't auditing
  the past — it's that switching happens in an instant. So most breadcrumbs are
  dropped **automatically** when the app detects you leaving or going idle. You
  don't have to remember to press anything.
- **AI does the work at re-entry, not at capture.** When you return, the AI weaves
  your sparse breadcrumbs + declared focus + away-signals into a short, concrete
  "get back in" brief. This is the feature that fixes ADHD's worst moment: context
  reload.
- **A single buoy, two outlets.** The same one-tap capture handles both *breadcrumbs*
  (markers about your current task) and *ideas* (unrelated sparks). You don't have
  to decide which at capture time — the AI classifies it afterward.

---

## Privacy-graded tracking

Breadcrumb deliberately ships with the most privacy-preserving signal by default,
and stronger signals are opt-in:

| Level | Signal | Where | Privacy |
|-------|--------|-------|---------|
| **0** (default) | tab/window/idle state — knows you *left*, not where to | web + desktop | fully private |
| **1** (opt-in) | foreground app **name** only (e.g. "Figma") — never content | desktop | name-only |
| **2** (future) | user-authorized sources (history, paste) | opt-in | explicit consent |

The MVP runs entirely on Level 0; the desktop build adds Level 1.

---

## Tech stack

- **Frontend:** React + TypeScript + Tailwind (Vite)
- **Desktop shell:** Tauri v2 (Rust + system webview — small bundle, low memory for an always-on app)
- **Storage:** local-first via IndexedDB (`idb`) — no account, no cloud for MVP
- **AI:** Anthropic API, via a serverless proxy (web) or OS-keychain-backed command (desktop) so the key never ships in the client

### Architecture at a glance

```
src/
  Buoy.tsx              the floating object (idle / capture / return states)
  App.tsx               wires the core loop
  useDriftDetection.ts  the heart: detects "you left" with zero user action
  ai.ts                 classify / re-entry brief / idea triage (graceful fallbacks)
  db.ts                 IndexedDB layer
  shortcuts.ts          global hotkey (desktop) to summon capture
  types.ts              data model
src-tauri/
  src/main.rs           native `foreground_app` (name only) for Level-1 signal
  tauri.conf.json       window: always-on-top, etc.
  capabilities/         Tauri v2 permissions
api/
  ai.ts                 Vercel serverless proxy to Anthropic (keeps key server-side)
```

---

## Getting started

### Prerequisites
- Node 18+ and npm
- Rust toolchain (for the desktop build) — https://rustup.rs
- Platform deps for Tauri — see https://tauri.app/start/prerequisites/

### Install & run (desktop)

```bash
npm install
npm run tauri dev
```

### Run as a plain web app (no Rust needed)

```bash
npm install
npm run dev      # http://localhost:1420
```

### Wire up AI (optional but recommended)
1. Get an Anthropic API key.
2. For web: deploy to Vercel and set `ANTHROPIC_API_KEY` in project env; the
   frontend talks to `/api/ai`.
3. For local dev: copy `.env.example` → `.env.local` and point `VITE_AI_PROXY`
   at your proxy. Without a proxy, the app still runs — every AI call falls back
   gracefully (e.g. re-entry shows a plain chronological recap).

### First-run notes
- **macOS Level-1:** reading the foreground app name needs Accessibility
  permission (System Settings → Privacy & Security → Accessibility). Until granted,
  the app silently runs at Level 0.
- **Global shortcut:** `Cmd/Ctrl + Shift + Space` summons quick capture.

---

## Roadmap

- [ ] Idea bucket view + AI triage/clustering
- [ ] Voice capture (Web Speech) for the idea button
- [ ] Re-entry brief history / timeline
- [ ] Menu-bar / tray mode with click-through transparency
- [ ] Per-focus stats (how often each task got interrupted)

---

## Credits

Designed and built by Baidi Wang. The "breadcrumb" framing came out of the core
design principle: capture should cost almost nothing, and meaning is reconstructed
later.
