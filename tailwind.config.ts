import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#050505",
          panel: "#1a1a1a",
          border: "#2a2a2a",
          matrix: "#00ff41",
          paper: "#e8e0c8",
          alert: "#ff3c00",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
