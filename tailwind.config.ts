import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // NimBty design system (spec §11) — expanded in Phase 3
        primary: { DEFAULT: "#0582CA", dark: "#0369A1", soft: "#E0F2FE" },
        navy: "#0B1B34",
        slate2: "#64748B",
        accent: {
          yellow: "#FFB731",
          coral: "#FF6B6B",
          purple: "#8B5CF6",
          mint: "#34D399",
          pink: "#FDA4AF",
        },
      },
      fontFamily: {
        display: ["Fredoka", "Nunito Sans", "system-ui", "sans-serif"],
        sans: ["Nunito Sans", "system-ui", "sans-serif"],
      },
      minHeight: { touch: "44px" }, // spec §40 touch targets
    },
  },
  plugins: [],
} satisfies Config;
