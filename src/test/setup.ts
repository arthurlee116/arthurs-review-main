import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({
    className: "mock-font",
    variable: "mock-font-variable",
    style: { fontFamily: "mock-font" },
  }),
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(),
}));
