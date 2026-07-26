import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#0A5A46",
          light: "#82B478",
          bg: "#F5F8F6",
          card: "#FFFFFF",
          border: "#E1E8E4",
          text: "#16261F",
          sub: "#5B6B64",
        },
      },
    },
  },
  plugins: [],
};

export default config;
