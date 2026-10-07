import { locale } from "next/root-params";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./locale";

export async function getLocale(): Promise<Locale> {
  const value = await locale();
  if (!isLocale(value)) notFound();
  return value;
}
