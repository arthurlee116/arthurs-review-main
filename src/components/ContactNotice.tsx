import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
export const CONTACT_NOTICE = "非常欢迎向我的邮箱（laoliarthur@outlook.com 或 iii7201027@proton.me）或者微信（bookspiano）留言，说说你的想法，给我提意见！";

export function ContactNotice({ className = "", locale = "zh" }: { className?: string; locale?: Locale }) {
  return <p className={`sans contact-notice text-center ${className}`}>{dictionary(locale).contactNotice}</p>;
}
