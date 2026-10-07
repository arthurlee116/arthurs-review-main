import type { Route } from "next";

export const locales = ["zh", "en"] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = "preferred_locale";
export const languageTag = { zh: "zh-CN", en: "en-GB" } as const;

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

export function stripLocale(path: string) {
  return path.replace(/^\/(zh|en)(?=\/|[?#]|$)/, "") || "/";
}

export function localizedPath(path: string, locale: Locale): Route {
  const base = stripLocale(path);
  return `/${locale}${base === "/" ? "" : base.startsWith("/") ? base : `/${base}`}` as Route;
}

export function switchLocalePath(path: string, locale: Locale) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return localizedPath("/", locale);
  const url = new URL(path, "https://locale.invalid");
  if (url.origin !== "https://locale.invalid") return localizedPath("/", locale);
  url.searchParams.delete("lang");
  const base = stripLocale(url.pathname);
  if (/^\/(studio|internal|_next|media|og|healthz|version)(\/|$)/.test(base)) return localizedPath("/", locale);
  return `${localizedPath(base, locale)}${url.search}${url.hash}` as Route;
}

export function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
