import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({
    className: "mock-font",
    variable: "mock-font-variable",
    style: { fontFamily: "mock-font" },
  }),
}));
