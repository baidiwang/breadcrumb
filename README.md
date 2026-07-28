# 🍞 Breadcrumb

**A low-friction working-memory companion for ADHD brains.**
Leave a trail the instant your attention drifts — find your way back when you return.

Breadcrumb is a tiny animated toaster character that floats at the corner of your
screen as a true desktop pet. When you switch away from what you were doing, it
quietly drops a marker — **no typing needed**. When you come back, it offers a
gentle "where was I?" brief that reconstructs what you were doing, where you
paused, and what comes next.

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

Breadcrumb deliberately ships with the most privacy-preserving signal by default:

| Level | Signal | Where | Privacy |
|-------|--------|-------|---------|
| **0** (default) | tab/window/idle state — knows you *left*, not where to | web + desktop | fully private |
| **1** (opt-in) | foreground app **name** only (e.g. "Figma") — never content | desktop | name-only |
| **2** (future) | user-authorized sources (history, paste) | opt-in | explicit consent |

The MVP runs entirely on Level 0; the desktop build adds Level 1 via AppKit
(`NSWorkspace.frontmostApplication`) — it reads only the app name, never the
window title or content. No Accessibility permission required.

---

## Tech stack

- **Frontend:** React + TypeScript + Tailwind v3 (Vite)
- **Desktop shell:** Tauri v2 (Rust + WKWebView — small bundle, low memory for an always-on app)
- **Storage:** local-first via IndexedDB (`idb`) — no account, no cloud for MVP
- **Fonts:** Nunito + Quicksand via `@fontsource` (self-hosted, no CDN request)
- **AI:** Anthropic Claude, routed through a Vite dev proxy locally or a Vercel
  edge function in production — the API key never enters the browser bundle

### Desktop pet window

The app runs as a frameless, fully transparent window (`decorations: false`,
`transparent: true`, `macOSPrivateApi: true`). On macOS, enabling
`macOSPrivateApi` is required — it activates wry's `drawsBackground = NO` call
on the underlying WKWebView, which is what actually turns the white background
off. The `alwaysOnTop` flag keeps the toaster visible over other apps.

The toaster SVG character (168×184 viewBox, rendered at 96×105 px) paints its
own pixels. All surrounding areas are alpha=0 — macOS passes clicks through those
regions automatically for non-opaque windows. The window can be repositioned by
dragging the toaster, using `startDragging()` from `@tauri-apps/api/window`.
When cards open (capture / return / history), the window resizes while keeping
its bottom-right corner anchored so the toaster doesn't jump.

### Architecture

```
src/
  App.tsx               wires the core loop + session/drift state
  Toaster.tsx           the desktop pet — idle/capture/return/history modes,
                        SVG character art, window resize anchored to bottom-right
  History.tsx           compact focus history panel
  useDriftDetection.ts  the heart: detects "you left" with zero user action
  ai.ts                 classify / re-entry brief / session naming (graceful fallbacks)
  db.ts                 IndexedDB layer (focuses, breadcrumbs, briefs)
  shortcuts.ts          global hotkey (Cmd/Ctrl+Shift+Space) to summon capture
  types.ts              Focus, Breadcrumb, Brief data model

src-tauri/
  src/main.rs           foreground_app command (Level-1, name-only via AppKit)
                        + set_cursor_ignore + bottom-right anchor on startup
  tauri.conf.json       window config: transparent, always-on-top, no decorations
  capabilities/         Tauri v2 permission declarations

api/
  ai.ts                 Vercel edge function proxy to Anthropic (key server-side)
```

---

## Getting started

### Prerequisites
- Node 18+ and npm
- Rust toolchain — https://rustup.rs
- Platform deps for Tauri — https://tauri.app/start/prerequisites/

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
2. Copy `.env.example` → `.env.local` and set `ANTHROPIC_API_KEY`.
3. Vite's dev server proxies `/api/ai` to Anthropic from Node — the key never
   enters the browser bundle.
4. For production: deploy to Vercel and set `ANTHROPIC_API_KEY` in project env;
   the `api/ai.ts` edge function handles the proxy there.

Without AI configured, the app still runs — every call falls back gracefully
(re-entry shows a plain chronological recap instead of a generated brief).

### First-run notes

- **Global shortcut:** `Cmd/Ctrl+Shift+Space` summons quick capture from anywhere
  on the desktop (registered via `tauri-plugin-global-shortcut`).
- **Dragging:** click and drag the toaster to reposition the pet anywhere on screen.
- **Context menu / lever:** right-click the toaster or click the gold lever to open
  the focus history panel.

### Dev testing shortcut

In dev builds only (`import.meta.env.DEV`), **Cmd+Shift+R** instantly triggers the
"Where was I?" return flow with a simulated 90 s drift — no need to wait 60 s for
the real idle threshold. This shortcut is tree-shaken out of production builds.

---

## Roadmap

- [ ] Idea bucket view + AI triage/clustering
- [ ] Voice capture (Web Speech) for the idea button
- [ ] Re-entry brief history / timeline
- [ ] Per-focus stats (how often each task got interrupted)
- [ ] Production desktop: route AI key through OS keychain via a Rust command

---

## Credits

Designed and built by Baidi Wang. The "breadcrumb" framing came out of the core
design principle: capture should cost almost nothing, and meaning is reconstructed
later.
