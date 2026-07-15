import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dbe6ff",
          200: "#b3c9ff",
          300: "#84a5ff",
          400: "#5b7fff",
          500: "#3757f0",
          600: "#2a41c9",
          700: "#22349e",
          800: "#1c2b7a",
          900: "#182459",
        },
      },
    },
  },
  plugins: [typography],
};
