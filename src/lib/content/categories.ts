export const categories = {
  commentary: { id: "commentary", label: "时事评论", href: "/commentary" },
  society: { id: "society", label: "社会分析", href: "/society" },
  misc: { id: "misc", label: "杂七杂八", href: "/misc" },
  life: { id: "life", label: "生活", href: "/life" },
} as const;

export type CategoryId = keyof typeof categories;

export function isCategoryId(value: string): value is CategoryId {
  return (
    value === "commentary" ||
    value === "society" ||
    value === "misc" ||
    value === "life"
  );
}

export function categoryLabel(category: CategoryId) {
  return categories[category].label;
}
