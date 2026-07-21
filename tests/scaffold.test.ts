import fs from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const nextConfig = fs.readFileSync("next.config.ts", "utf8");

describe("project scaffold", () => {
  it("runs the test suite", () => {
    expect(true).toBe(true);
  });

  it("runs the TypeScript 7 CLI from the lint gate", () => {
    expect(packageJson.scripts.lint).toBe("pnpm lint:js && pnpm lint:ts");
    expect(packageJson.scripts["lint:js"]).toBe("eslint");
    expect(packageJson.scripts["lint:ts"]).toBe("tsc --noEmit");
    expect(packageJson.scripts.typecheck).toBe("pnpm lint:ts");
  });

  it("enables the stable Next.js and React compiler upgrades", () => {
    expect(nextConfig).toContain("typedRoutes: true");
    expect(nextConfig).toContain("cacheComponents: true");
    expect(nextConfig).toContain("reactCompiler: true");
    expect(packageJson.devDependencies).toHaveProperty("babel-plugin-react-compiler");
  });

  it("uses the CodeMirror 6 Markdown engine in Studio", () => {
    expect(packageJson.dependencies).toHaveProperty("@uiw/react-codemirror");
    expect(packageJson.dependencies).toHaveProperty("@codemirror/lang-markdown");
  });

  it("defines the accepted short public-content cache window", () => {
    expect(nextConfig).toContain("publicContent:");
    expect(nextConfig).toContain("stale: 30");
    expect(nextConfig).toContain("revalidate: 60");
    expect(nextConfig).toContain("expire: 3_600");
  });

  it("routes public article reads through an explicit cache boundary", () => {
    const publicContent = fs.readFileSync("src/lib/services/public-content.ts", "utf8");
    expect(publicContent).toContain('"use cache"');
    expect(publicContent).toContain('cacheLife("publicContent")');
  });

  it("keeps public routes eligible for instant rendering", () => {
    const files = [
      "src/app/page.tsx",
      "src/app/_categoryPage.tsx",
      "src/app/_articlePage.tsx",
      "src/app/about/page.tsx",
      "src/app/archive/page.tsx",
      "src/app/proofs/page.tsx",
      "src/app/search/page.tsx",
      "src/app/commentary/page.tsx",
      "src/app/commentary/[slug]/page.tsx",
      "src/app/society/page.tsx",
      "src/app/society/[slug]/page.tsx",
      "src/app/misc/page.tsx",
      "src/app/misc/[slug]/page.tsx",
    ];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("instant = false");
      expect(source, file).not.toContain("connection()");
    }

    const searchPage = fs.readFileSync("src/app/search/page.tsx", "utf8");
    expect(searchPage).toContain("<Suspense");
  });

  it("defers build-time SQLite reads behind PPR boundaries", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/_categoryPage.tsx",
      "src/app/about/page.tsx",
      "src/app/archive/page.tsx",
      "src/app/proofs/page.tsx",
    ]) {
      expect(fs.readFileSync(file, "utf8"), file).toContain("await io()");
    }

    for (const file of [
      "src/app/page.tsx",
      "src/app/about/page.tsx",
      "src/app/archive/page.tsx",
      "src/app/proofs/page.tsx",
      "src/app/commentary/page.tsx",
      "src/app/society/page.tsx",
      "src/app/misc/page.tsx",
    ]) {
      expect(fs.readFileSync(file, "utf8"), file).toContain("<Suspense");
    }
  });
});
