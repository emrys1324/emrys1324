import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm café palette — all text/background pairs below meet WCAG AA.
        coffee: {
          50: "#f8f3ee",
          100: "#efe4d8",
          200: "#dcc5ad",
          300: "#c4a07f",
          400: "#a87c58",
          500: "#8b5e3c",
          600: "#714a2f",
          700: "#5a3a25",
          800: "#432c1d",
          900: "#2e1e14",
        },
        cream: { DEFAULT: "#fbf7f0", 100: "#f6efe3", 200: "#ede1cc" },
        sage: {
          100: "#e6ece2",
          200: "#c9d6c1",
          500: "#6b8462",
          600: "#556c4d",
          700: "#435639",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(46,30,20,.06), 0 4px 16px rgba(46,30,20,.06)" },
    },
  },
  plugins: [],
};
export default config;
