import { colors } from "./src/constants/colors.js";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        subText: colors.subText,
      },
      keyframes: {
        "article-cross-fade-1": {
          "0%, 100%": {
            opacity: "1",
            transform: "rotate(0deg) scale(1)",
          },
          "50%": {
            opacity: "0",
            transform: "rotate(180deg) scale(1.1)",
          },
        },
        "article-cross-fade-2": {
          "0%, 100%": {
            opacity: "0",
            transform: "rotate(180deg) scale(1.1)",
          },
          "50%": {
            opacity: "1",
            transform: "rotate(360deg) scale(1)",
          },
        },
        "scale-in": {
          "0%": {
            opacity: "0",
            transform: "scale(0.95)",
          },
          "100%": {
            opacity: "1",
            transform: "scale(1)",
          },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "article-cross-fade-1": "article-cross-fade-1 6s ease-in-out infinite",
        "article-cross-fade-2": "article-cross-fade-2 6s ease-in-out infinite",
        "scale-in": "scale-in 0.2s ease-out",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
