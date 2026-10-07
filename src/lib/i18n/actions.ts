"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, localeCookie, switchLocalePath } from "./locale";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) throw new Error("Invalid locale");
  const returnTo = formData.get("returnTo");
  (await cookies()).set(localeCookie, locale, { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect(switchLocalePath(typeof returnTo === "string" ? returnTo : "/", locale));
}
