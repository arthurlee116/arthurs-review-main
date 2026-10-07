import { test as base, expect } from "@playwright/test";

// Every test uses this fixture, including tests against the production image.
// Never let test visits reach Cloudflare's ingestion endpoint.
export const test = base.extend<{ analyticsNetwork: void }>({
  analyticsNetwork: [async ({ context }, use) => {
    await context.route("https://static.cloudflareinsights.com/**", (route) =>
      route.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: "/* analytics disabled in tests */" }),
    );
    await context.route("https://cloudflareinsights.com/**", (route) =>
      route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }),
    );
    await use();
  }, { auto: true }],
});

export { expect };
