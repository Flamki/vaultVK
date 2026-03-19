import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        ink: {
          950: "#090b10",
          900: "#10151d",
          800: "#1a2331",
          700: "#253144"
        },
        accent: {
          cyan: "#2dd4bf",
          sky: "#38bdf8",
          orange: "#fb923c"
        }
      },
      keyframes: {
        floatIn: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.65" },
          "50%": { opacity: "1" }
        }
      },
      animation: {
        floatIn: "floatIn 480ms ease-out both",
        pulseSoft: "pulseSoft 1600ms ease-in-out infinite"
      }
    }
  },
  plugins: []
} satisfies Config;

