import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Lawyered brand surface tokens (from Figma prototype)
        navy: {
          DEFAULT: "#0d1a2c",
          900: "#0b1622",
          800: "#0d1a2c",
          700: "#14273d",
          600: "#1c3350",
        },
        canvas: "#f4f6f9",
        card: "#ffffff",
        line: "#e6eaf0",
        ink: {
          DEFAULT: "#0f1b2d",
          muted: "#5b6b7f",
          faint: "#8a97a8",
        },
        brand: {
          DEFAULT: "#2563eb",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        teal: {
          DEFAULT: "#0d9488",
          500: "#14b8a6",
        },
        sev: {
          critical: "#b91c1c",
          criticalBg: "#fee2e2",
          high: "#b45309",
          highBg: "#fef3c7",
          medium: "#a16207",
          mediumBg: "#fef9c3",
          low: "#15803d",
          lowBg: "#dcfce7",
        },
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,27,45,0.04), 0 1px 3px rgba(15,27,45,0.06)",
        pop: "0 8px 30px rgba(15,27,45,0.12)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
