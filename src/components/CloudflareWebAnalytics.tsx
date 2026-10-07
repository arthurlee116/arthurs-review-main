"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverSnapshot = () => false;
// Public pages can also be opened on the private Studio hostname.
export const isPublicAnalyticsPage = (hostname: string, pathname: string) =>
  !hostname.startsWith("studio.") && pathname !== "/studio" && !pathname.startsWith("/studio/");
const publicSnapshot = () => isPublicAnalyticsPage(location.hostname, location.pathname);

export function CloudflareWebAnalytics({ token }: { token: string | null }) {
  const publicHost = useSyncExternalStore(subscribe, publicSnapshot, serverSnapshot);
  if (!token || !publicHost) return null;

  return (
    <Script
      id="cloudflare-web-analytics"
      type="module"
      crossOrigin="anonymous"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
