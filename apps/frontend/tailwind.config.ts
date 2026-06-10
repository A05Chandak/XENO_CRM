import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06111f",
          900: "#0b172a",
          800: "#12233e",
          700: "#203559"
        },
        ember: {
          500: "#f97316",
          400: "#fb923c"
        },
        mint: {
          400: "#4ade80",
          500: "#22c55e"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 18px 60px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;
