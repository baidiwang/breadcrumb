// AI layer. Four precise jobs:
//   1. classify(note)            -> breadcrumb | idea | unsure
//   2. reentryBrief(crumbs)      -> "You were doing X, paused at Y, next was Z"  ★ star feature
//   3. triageIdeas(ideas)        -> cluster suggestions
//   4. suggestSessionName(crumbs)-> infer a short name from breadcrumb trail
//
// Key routing — two supported modes, tried in order:
//   VITE_AI_PROXY        Web/Vercel: serverless proxy at /api/ai holds the key server-side.
//   VITE_ANTHROPIC_API_KEY  Local dev only: call Anthropic directly from the frontend.
//                           Key lives in .env.local (gitignored). Safe for local machines only.
// TODO: before public release, add a third path — Tauri command that reads from the OS keychain.
//
// Every call degrades gracefully so the app is always usable without AI.

import type { Breadcrumb, Focus } from "./types";

const PROXY = import.meta.env.VITE_AI_PROXY as string | undefined;
// TODO: before public release, route through authenticated proxy.
// VITE_ANTHROPIC_API_KEY is for local dev only — never ship a real key in a bundled app.
const DIRECT_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;

const MODEL = "claude-haiku-4-5-20251001";

async function callModel(system: string, user: string): Promise<string> {
  if (PROXY) {
    const res = await fetch(PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user }),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const data = await res.json();
    return (data.text ?? "").trim();
  }

  if (DIRECT_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIRECT_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`direct ${res.status}`);
    const data = await res.json();
    return (data?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
  }

  throw new Error("no-ai-config");
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
  const head = focus?.label ? `You were working on "${focus.label}."` : "You were mid-something.";
  const noted = crumbs.filter((c) => c.text);
  if (noted.length === 0) return `${head} You didn't leave a note — what was your next step?`;
  const last = noted[noted.length - 1];
  return `${head} Your last breadcrumb: "${last.text}." Pick up from there.`;
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

// --- 4. session name suggestion -------------------------------------------
export async function suggestSessionName(crumbs: Breadcrumb[]): Promise<string> {
  if (crumbs.length === 0) return "";
  try {
    const system =
      "Infer what an ADHD user was working on from their breadcrumb trail. " +
      "Reply with ONLY a short session name: 2-5 words, lowercase, no quotes, no punctuation. " +
      "Examples: reviewing pull requests, writing cover letter, debugging auth flow.";
    const lines = crumbs
      .slice(-10)
      .map((c) => {
        const app = c.signal?.foregroundApp ? ` [${c.signal.foregroundApp}]` : "";
        return `- ${c.text ?? "(no note)"}${app}`;
      })
      .join("\n");
    const name = await callModel(system, `Breadcrumbs:\n${lines}`);
    return name.replace(/^["'\s]+|["'\s]+$/g, "").toLowerCase();
  } catch {
    return "";
  }
}
