import type { Locale } from "@/lib/i18n/locale";
import { Suspense } from "react";
import { Masthead } from "@/components/Masthead";
import { PublicNav, PublicNavStatic } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { CloudflareWebAnalytics } from "@/components/CloudflareWebAnalytics";
import { getCloudflareWebAnalyticsToken } from "@/lib/env";

export function PublicShell({
  children,
  mastheadHeadingLevel = 1,
  locale = "zh",
}: {
  children: React.ReactNode;
  mastheadHeadingLevel?: 1 | 2;
  locale?: Locale;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Masthead locale={locale} headingLevel={mastheadHeadingLevel} />
      <Suspense fallback={<PublicNavStatic locale={locale} />}>
        <PublicNav locale={locale} />
      </Suspense>
      <div className="flex-1">{children}</div>
      <PublicFooter locale={locale} />
      <CloudflareWebAnalytics token={getCloudflareWebAnalyticsToken()} />
    </div>
  );
}
