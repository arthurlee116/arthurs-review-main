import "../globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: { default: "Studio | Arthur's Review", template: "%s | Arthur's Review" }, robots: { index: false, follow: false } };
export default function StudioRootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
