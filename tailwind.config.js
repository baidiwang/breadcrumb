/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Nunito", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        heading: ["Quicksand", "Nunito", "sans-serif"],
      },
      colors: {
        crumb: {
          cream:      "#FAF7F0", // base window background
          gold:       "#D9A85C", // PRIMARY accent — toaster body, highlights, buttons
          "gold-dim": "#C4914A", // pressed / shadow gold
          moss:       "#4A6B4D", // text + strokes ONLY — never fills, never buttons
          ink:        "#1C1410", // primary dark text on cream
          "ink-dim":  "#6B5A48", // secondary / muted text
          fog:        "#E8E2D8", // dividers, subtle card backgrounds
        },
      },
      keyframes: {
        // Idle state: gentle vertical float
        bob: {
          "0%,100%": { transform: "translateY(0px)"  },
          "50%":     { transform: "translateY(-5px)" },
        },
        // Auto-crumb or manual note saved: dots fall from toaster bottom
        "crumb-fall": {
          "0%":   { transform: "translateY(0)    scale(1)",   opacity: "1" },
          "100%": { transform: "translateY(28px) scale(0.3)", opacity: "0" },
        },
        // Return card / history panel: spring up from below
        "peek-in": {
          "0%":   { transform: "translateY(80px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
        // Capture input or overlays: scale pop
        "pop-in": {
          "0%":   { transform: "scale(0.88) translateY(6px)", opacity: "0" },
          "100%": { transform: "scale(1)    translateY(0)",   opacity: "1" },
        },
        // Subtle fade for secondary elements
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // Capture mode: pulse ring around toaster
        "ring-pulse": {
          "0%,100%": { transform: "scale(1)",    opacity: "0.5" },
          "50%":     { transform: "scale(1.08)", opacity: "0.8" },
        },
        // Idle toast slice: gentle breathe (used via animate-breathe class)
        breathe: {
          "0%, 100%": { transform: "scale(1) translateY(0px)" },
          "50%":      { transform: "scale(1.015) translateY(-2px)" },
        },
      },
      animation: {
        bob:          "bob 2.4s ease-in-out infinite",
        "crumb-fall": "crumb-fall 0.65s ease-in forwards",
        "peek-in":    "peek-in 0.38s cubic-bezier(0.34,1.56,0.64,1) both",
        "pop-in":     "pop-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both",
        "fade-in":    "fade-in 0.2s ease both",
        "ring-pulse": "ring-pulse 1.8s ease-in-out infinite",
        breathe:      "breathe 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
