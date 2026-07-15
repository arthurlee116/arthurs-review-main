import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const emptyRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => emptyRect;
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([emptyRect], {
      item: (index: number) => (index === 0 ? emptyRect : null),
    }) as unknown as DOMRectList;
}

vi.mock("next/font/local", () => ({
  default: () => ({
    className: "mock-font",
    variable: "mock-font-variable",
    style: { fontFamily: "mock-font" },
  }),
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn((callback: () => unknown) => void callback()),
  connection: vi.fn(),
}));
