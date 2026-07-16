import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "http";

const MODEL = "claude-haiku-4-5-20251001";

// Local dev proxy for /api/ai — runs in Node, never exposes the key to the browser bundle.
// In production (Vercel) the same /api/ai route is handled by api/ai.ts.
function aiLocalProxy(anthropicKey: string | undefined): Plugin {
  return {
    name: "ai-local-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        "/api/ai",
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "method not allowed" }));
            return;
          }
          if (!anthropicKey) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: "ANTHROPIC_API_KEY not set in .env.local" })
            );
            return;
          }
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            void (async () => {
              try {
                const { system, user } = JSON.parse(
                  Buffer.concat(chunks).toString()
                ) as { system: string; user: string };
                const r = await fetch(
                  "https://api.anthropic.com/v1/messages",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-api-key": anthropicKey,
                      "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                      model: MODEL,
                      max_tokens: 400,
                      system,
                      messages: [{ role: "user", content: user }],
                    }),
                  }
                );
                const data = (await r.json()) as {
                  content?: Array<{ type: string; text: string }>;
                  error?: { message: string };
                };
                if (!r.ok) {
                  throw new Error(
                    `Anthropic ${r.status}: ${data.error?.message ?? r.statusText}`
                  );
                }
                const text = (data.content ?? [])
                  .filter((b) => b.type === "text")
                  .map((b) => b.text)
                  .join("\n")
                  .trim();
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ text }));
              } catch (e) {
                console.error("[ai-local-proxy]", e);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(e) }));
              }
            })();
          });
        }
      );
    },
  };
}

// Tauri expects a fixed port and no auto-clear so the Rust side can attach.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), aiLocalProxy(env.ANTHROPIC_API_KEY)],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
    },
    build: {
      target: "es2021",
      outDir: "dist",
    },
  };
});
