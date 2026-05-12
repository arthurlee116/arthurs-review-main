import { csrfCookie } from "@/lib/auth/constants";

export function csrfToken() {
  const needle = `${csrfCookie}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(needle))
    ?.split("=")[1];
}
