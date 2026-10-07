import type { ComponentProps } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareWebAnalytics, isPublicAnalyticsPage } from "@/components/CloudflareWebAnalytics";
import { getCloudflareWebAnalyticsToken } from "@/lib/env";

vi.mock("next/script", () => ({
  default: ({ strategy, ...props }: ComponentProps<"script"> & { strategy: string }) => (
    <script {...props} data-strategy={strategy} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare Web Analytics", () => {
  it("defaults to disabled without a site token", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN", "");
    expect(getCloudflareWebAnalyticsToken()).toBeNull();
    const { container } = render(<CloudflareWebAnalytics token={null} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("validates the public site token without requiring admin credentials", () => {
    vi.stubEnv("ADMIN_PASSWORD_HASH", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN", "a".repeat(32));
    expect(getCloudflareWebAnalyticsToken()).toBe("a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN", "invalid");
    expect(() => getCloudflareWebAnalyticsToken()).toThrow();
  });

  it("uses the official module script with SPA tracking and afterInteractive loading", () => {
    const { container } = render(<CloudflareWebAnalytics token={"a".repeat(32)} />);
    const script = container.querySelector("script")!;
    expect(script).toHaveAttribute("src", "https://static.cloudflareinsights.com/beacon.min.js");
    expect(script).toHaveAttribute("type", "module");
    expect(script).toHaveAttribute("data-strategy", "afterInteractive");
    expect(JSON.parse(script.dataset.cfBeacon!)).toEqual({ token: "a".repeat(32) });
  });

  it("excludes the private Studio hostname even for public pages", () => {
    expect(isPublicAnalyticsPage("studio.blog.leesaitool.com", "/life")).toBe(false);
    expect(isPublicAnalyticsPage("blog.leesaitool.com", "/studio")).toBe(false);
    expect(isPublicAnalyticsPage("blog.leesaitool.com", "/studio/preview/missing")).toBe(false);
    expect(isPublicAnalyticsPage("blog.leesaitool.com", "/life")).toBe(true);
  });
});
