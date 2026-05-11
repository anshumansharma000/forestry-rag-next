import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#f8f9fa",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f4f5",
        "surface-container": "#edeeef",
        "surface-container-high": "#e7e8e9",
        "on-surface": "#191c1d",
        "on-surface-variant": "#414844",
        outline: "#717973",
        "outline-variant": "#c1c8c2",
        primary: "#012d1d",
        "primary-container": "#1b4332",
        "on-primary-container": "#86af99",
        tertiary: "#322319",
        "tertiary-container": "#4a382d",
        "tertiary-fixed": "#f9ddce",
        "on-tertiary-fixed": "#27180f",
      },
      fontFamily: {
        sans: ["var(--font-public-sans)", "Public Sans", "sans-serif"],
      },
      boxShadow: {
        tonal: "0 4px 12px rgba(27, 67, 50, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
