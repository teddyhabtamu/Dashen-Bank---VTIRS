import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#273274",
          50: "#eef0f8",
          100: "#d4d8ec",
          200: "#aab2d9",
          300: "#7f8cc6",
          400: "#5566b3",
          500: "#273274",
          600: "#1f2860",
          700: "#171e48",
          800: "#0f1430",
          900: "#080a18",
        },
        secondary: {
          DEFAULT: "#012169",
          50: "#e6ecf7",
          100: "#cdd9ef",
          200: "#9bb3df",
          300: "#698dcf",
          400: "#3767bf",
          500: "#012169",
          600: "#011a54",
          700: "#01143f",
          800: "#000e2a",
          900: "#00081b",
        },
        accent: {
          DEFAULT: "#FDD79A",
          50: "#fef6e9",
          100: "#fdeed2",
          200: "#fdd79a",
          300: "#fcc06a",
          400: "#fbac42",
          500: "#e8941a",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px -2px rgb(0 0 0 / 0.12)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
