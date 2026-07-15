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

  it("keeps ESLint and the TypeScript 7 CLI as separate CI steps", () => {
    expect(packageJson.scripts.lint).toBe("eslint");
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
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
});
