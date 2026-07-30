import { describe, expect, it } from "vitest";

import { categories, isCategoryId } from "@/lib/content/categories";

describe("categories", () => {
  it("includes the life category with label 生活 and href /life", () => {
    expect(categories.life.label).toBe("生活");
    expect(categories.life.id).toBe("life");
    expect(categories.life.href).toBe("/life");
  });

  it("isCategoryId returns true for life", () => {
    expect(isCategoryId("life")).toBe(true);
  });
});
