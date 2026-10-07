import type { Metadata, Viewport } from "next";
import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, languageTag } from "@/lib/i18n/locale";
import { publicPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/seo";
import "../globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export function generateStaticParams() { return [{ locale: "zh" }, { locale: "en" }]; }
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = dictionary(locale);
  return { ...publicPageMetadata({ title: "Arthur's Review", description: t.siteDescription, path: "/", locale }), metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"), title: { default: "Arthur's Review", template: "%s | Arthur's Review" } };
}
export default async function PublicRootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const about = absoluteUrl(localizedPath("/about", locale));
  const home = absoluteUrl(localizedPath("/", locale));
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Person", "@id": `${about}#arthur`, name: "Arthur", url: about },
      { "@type": "WebSite", "@id": `${home}#website`, name: "Arthur's Review", url: home, description: dictionary(locale).siteDescription, inLanguage: languageTag[locale], publisher: { "@id": `${about}#arthur` } },
    ],
  };
  return <html lang={languageTag[locale]} suppressHydrationWarning><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />{children}</body></html>;
}
