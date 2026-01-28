import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fiddo: {
          blue: '#1e40af',
          orange: '#f97316',
          turquoise: '#14b8a6',
        },
      },
    },
  },
  plugins: [],
};

export default config;
