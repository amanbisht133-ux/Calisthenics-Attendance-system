import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          900: "#0a0b0a",
          800: "#121412",
          700: "#191b19",
          600: "#22251f",
          500: "#2e322a",
        },
        accent: {
          green: "#8CFF3C",
          "green-dim": "#5fbf24",
          orange: "#FF7A1A",
          "orange-dim": "#cc5f10",
        },
        status: {
          active: "#4ADE80",
          expiring: "#FACC15",
          expired: "#F87171",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(140, 255, 60, 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
