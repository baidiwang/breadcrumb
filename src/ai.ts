// AI layer. Four precise jobs:
//   1. classify(note)            -> breadcrumb | idea | unsure
//   2. reentryBrief(crumbs)      -> "You were doing X, paused at Y, next was Z"  ★ star feature
//   3. triageIdeas(ideas)        -> cluster suggestions
//   4. suggestSessionName(crumbs)-> infer a short name from breadcrumb trail
//
// Key routing:
//   VITE_AI_PROXY=/api/ai  (set in .env.local AND on Vercel)
//     Local dev  → Vite configureServer middleware (vite.config.ts) proxies to Anthropic
//                  from Node. ANTHROPIC_API_KEY is read by Node; key never enters the bundle.
//     Vercel     → api/ai.ts edge function. ANTHROPIC_API_KEY set in Vercel env vars.
// TODO: production Tauri binary — route through OS keychain via a Rust command.
//
// Every call degrades gracefully — app is fully usable without AI.

import type { Breadcrumb, Focus } from "./types";

const PROXY = import.meta.env.VITE_AI_PROXY as string | undefined;

async function callModel(system: string, user: string): Promise<string> {
  if (!PROXY) throw new Error("[breadcrumb/ai] VITE_AI_PROXY not set");

  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[breadcrumb/ai] proxy ${res.status}: ${body}`);
  }
  const data = await res.json() as { text?: string };
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
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      kind: string;
      tags: unknown[];
    };
    return {
      kind: ["breadcrumb", "idea", "unsure"].includes(parsed.kind)
        ? (parsed.kind as Breadcrumb["kind"])
        : "unsure",
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags.slice(0, 3) as string[])
        : [],
    };
  } catch (e) {
    console.error("[breadcrumb/ai] classify failed:", e);
    return fallback;
  }
}

// --- 2. re-entry brief (★) -----------------------------------------------
export async function reentryBrief(
  focus: Focus | undefined,
  crumbs: Breadcrumb[],
  signal?: { awayMs?: number; foregroundApp?: string }
): Promise<string> {
  const fallback = buildPlainRecap(focus, crumbs);
  try {
    const system =
      "You are a warm re-entry assistant for an ADHD user returning after being away.\n\n" +
      "STRICT RULES — follow every one without exception:\n" +
      "1. NEVER ask the user a question. Not even rhetorically. Every sentence ends with a period.\n" +
      "2. NEVER speculate about what the user was doing beyond the exact facts listed below.\n" +
      "3. Report only what the signals show: time away, app names, written notes.\n" +
      "4. When written notes are absent, state the time and app seen, then suggest ONE\n" +
      "   concrete, low-effort next action (e.g. \"Reopen Chrome to pick up where you left off.\").\n" +
      "5. Maximum 3 sentences. Warm, calm tone. No preamble, no hedging phrases like 'it seems'.";

    // Resolve return signal — prefer explicit arg, fall back to last crumb with signal data.
    const awayMs =
      signal?.awayMs ??
      [...crumbs].reverse().find((c) => c.signal?.awayMs)?.signal?.awayMs ??
      0;
    const appSeen =
      signal?.foregroundApp ??
      [...crumbs].reverse().find((c) => c.signal?.foregroundApp)?.signal?.foregroundApp;

    const secs = Math.round(awayMs / 1000);
    const awayStr =
      secs < 90 ? `${secs} seconds` : `${Math.round(awayMs / 60000)} minutes`;

    const facts: string[] = [
      `Focus label: ${focus?.label ?? "none"}`,
      `Time away: ${awayStr}`,
    ];
    if (appSeen) facts.push(`App when returning: ${appSeen}`);

    const noted = crumbs.filter((c) => c.text);
    if (noted.length > 0) {
      facts.push("Written notes (oldest first):");
      for (const c of noted.slice(-5)) {
        const t = new Date(c.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        facts.push(`  ${t}: "${c.text}"`);
      }
    } else {
      facts.push("Written notes: none");
    }

    const text = await callModel(system, facts.join("\n"));
    return text || fallback;
  } catch (e) {
    console.error("[breadcrumb/ai] reentryBrief failed:", e);
    return fallback;
  }
}

function buildPlainRecap(focus: Focus | undefined, crumbs: Breadcrumb[]): string {
  if (!focus && crumbs.length === 0)
    return "Welcome back. Nothing was logged while you were away.";
  const head = focus?.label
    ? `You were working on "${focus.label}."`
    : "You were mid-something.";
  const noted = crumbs.filter((c) => c.text);
  if (noted.length === 0)
    return `${head} You didn't leave a note — what was your next step?`;
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
  } catch (e) {
    console.error("[breadcrumb/ai] triageIdeas failed:", e);
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
  } catch (e) {
    console.error("[breadcrumb/ai] suggestSessionName failed:", e);
    return "";
  }
}
