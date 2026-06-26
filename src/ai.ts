// AI layer. Three precise jobs (see BUOY_SPEC §4):
//   1. classify(note)        -> breadcrumb | idea | unsure
//   2. reentryBrief(crumbs)  -> "You were doing X, paused at Y, next was Z"  ★ star feature
//   3. triageIdeas(ideas)    -> cluster suggestions
//
// IMPORTANT (security): never ship an API key in the frontend. Two supported modes:
//   - Web/Vercel: route through a serverless function at /api/ai (proxy holds the key).
//   - Desktop/Tauri: route through a Rust command that reads the key from the OS keychain.
// For first-run local dev you can temporarily set VITE_AI_PROXY to your proxy URL.
//
// Every call degrades gracefully so the app is always usable without AI.

import type { Breadcrumb, Focus } from "./types";

const PROXY = import.meta.env.VITE_AI_PROXY as string | undefined;

async function callModel(system: string, user: string): Promise<string> {
  if (!PROXY) throw new Error("no-proxy");
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  const data = await res.json();
  // proxy is expected to return { text: string }
  return (data.text ?? "").trim();
}

// --- 1. classify ----------------------------------------------------------
export async function classify(
  text: string,
  focusLabel?: string
): Promise<{ kind: Breadcrumb["kind"]; tags: string[] }> {
  const fallback = { kind: "unsure" as const, tags: [] };
  if (!text.trim()) return fallback;
  try {
    const system =
      "You classify a short note from an ADHD user. Decide if it is a BREADCRUMB " +
      "(a marker about the task they're currently on) or an IDEA (an unrelated new spark). " +
      "If genuinely ambiguous, say UNSURE. Reply ONLY as JSON: " +
      '{"kind":"breadcrumb|idea|unsure","tags":["..."]}. Max 3 short tags.';
    const user = `Current focus: ${focusLabel ?? "(none)"}\nNote: ${text}`;
    const raw = await callModel(system, user);
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      kind: ["breadcrumb", "idea", "unsure"].includes(parsed.kind) ? parsed.kind : "unsure",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
    };
  } catch {
    return fallback;
  }
}

// --- 2. re-entry brief (★) -----------------------------------------------
export async function reentryBrief(
  focus: Focus | undefined,
  crumbs: Breadcrumb[]
): Promise<string> {
  // Graceful fallback: a plain chronological recap, no AI needed.
  const fallback = buildPlainRecap(focus, crumbs);
  try {
    const system =
      "You help an ADHD user get back into a task after being away. " +
      "Given their declared focus and a list of breadcrumbs (some auto-captured with no text), " +
      "write a warm, 2-3 sentence 'get back in' brief in the shape: " +
      "what they were doing, where they paused, what the next step likely is. " +
      "Be concrete, no fluff, no preamble.";
    const lines = crumbs
      .map((c) => {
        const when = new Date(c.createdAt).toLocaleTimeString();
        const away = c.signal?.awayMs ? ` (away ${Math.round(c.signal.awayMs / 60000)}m)` : "";
        const app = c.signal?.foregroundApp ? ` -> ${c.signal.foregroundApp}` : "";
        return `- ${when}${away}${app}: ${c.text ?? "(no note)"}`;
      })
      .join("\n");
    const user = `Focus: ${focus?.label ?? "(none declared)"}\nBreadcrumbs:\n${lines}`;
    const text = await callModel(system, user);
    return text || fallback;
  } catch {
    return fallback;
  }
}

function buildPlainRecap(focus: Focus | undefined, crumbs: Breadcrumb[]): string {
  if (!focus && crumbs.length === 0) return "Welcome back. Nothing was logged while you were away.";
  const head = focus ? `You were working on “${focus.label}.”` : "You were mid-something.";
  const noted = crumbs.filter((c) => c.text);
  if (noted.length === 0) return `${head} You didn't leave a note — what was your next step?`;
  const last = noted[noted.length - 1];
  return `${head} Your last breadcrumb: “${last.text}.” Pick up from there.`;
}

// --- 3. idea triage -------------------------------------------------------
export async function triageIdeas(ideas: Breadcrumb[]): Promise<string> {
  const fallback = "Your ideas are listed below. (Connect AI to auto-group related ones.)";
  if (ideas.length === 0) return "No ideas captured yet.";
  try {
    const system =
      "Group these short idea notes into a few labeled clusters. " +
      "Reply as short markdown with cluster headers and bullet points. Be concise.";
    const user = ideas.map((i) => `- ${i.text ?? "(no text)"}`).join("\n");
    return (await callModel(system, user)) || fallback;
  } catch {
    return fallback;
  }
}
