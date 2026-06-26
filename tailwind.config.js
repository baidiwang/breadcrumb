/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // warm, calm buoy palette
        buoy: {
          glow: "#ffd9a0",
          core: "#ff9e5e",
          deep: "#1c1a26",
          mist: "#2a2740",
        },
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.12)", opacity: "1" },
        },
        pulse_soft: {
          "0%, 100%": { boxShadow: "0 0 12px 2px rgba(255,158,94,0.35)" },
          "50%": { boxShadow: "0 0 22px 6px rgba(255,158,94,0.65)" },
        },
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
        "pulse-soft": "pulse_soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
