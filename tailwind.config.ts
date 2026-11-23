import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matches calisthenicslabindia.club / indiancalisthenicsschool.com: ink black + ember orange
        base: {
          900: "#0a0a0b",
          800: "#131315",
          700: "#1b1b1e",
          600: "#27272b",
          500: "#36363b",
        },
        accent: {
          // "green" is the app's primary accent token; it now carries the websites' brand orange.
          green: "#f38320",
          "green-dim": "#e2531a",
          orange: "#ffb15c",
          "orange-dim": "#f38320",
        },
        status: {
          active: "#4ADE80",
          expiring: "#FACC15",
          expired: "#F87171",
        },
      },
      fontFamily: {
        display: ["'Bebas Neue'", "'Oswald'", "Impact", "sans-serif"],
        sans: ["'Lexend'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 8px 28px rgba(243, 131, 32, 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
