import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",
          raised: "rgb(var(--bg-raised) / <alpha-value>)",
          sunken: "rgb(var(--bg-sunken) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          faint: "rgb(var(--fg-faint) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          fg: "rgb(var(--danger-fg) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "rgb(var(--warn) / <alpha-value>)",
          fg: "rgb(var(--warn-fg) / <alpha-value>)",
        },
      },
      fontFamily: {
        // v1.0: unified to Inter Variable everywhere except mono.
        // `font-display` uses the same family with tighter tracking + heavier
        // weight via the display-{xl,lg,md} sizes below - produces the
        // "Inter Display" look without loading a second font family.
        sans: ["'Inter Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "ui-monospace", "monospace"],
        display: ["'Inter Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(3rem, 7vw, 5.5rem)", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display-lg": ["clamp(2.25rem, 4.5vw, 3.75rem)", { lineHeight: "1.04", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-md": ["clamp(1.625rem, 2.75vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.022em", fontWeight: "650" }],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "blink": {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "blink": "blink 1s steps(1, end) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
