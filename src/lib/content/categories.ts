import { dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
export const categories = {
  commentary: { id: "commentary", label: "时事评论", href: "/commentary" },
  society: { id: "society", label: "社会分析", href: "/society" },
  misc: { id: "misc", label: "杂七杂八", href: "/misc" },
  life: { id: "life", label: "生活", href: "/life" },
} as const;

export type CategoryId = keyof typeof categories;

export const categoryIds = Object.keys(categories) as [CategoryId, ...CategoryId[]];

export function isCategoryId(value: string): value is CategoryId {
  return (categoryIds as readonly string[]).includes(value);
}

export function categoryLabel(category: CategoryId, locale: Locale = "zh") {
  return dictionary(locale)[category];
}
