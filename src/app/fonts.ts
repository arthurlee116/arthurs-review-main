import localFont from "next/font/local";

export const publicSerif = localFont({
  src: [
    {
      path: "./fonts/noto-serif-sc-subset-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/noto-serif-sc-subset-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-public-serif",
  display: "swap",
  preload: false,
  fallback: ["Songti SC", "STSong", "Noto Serif SC", "Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});
