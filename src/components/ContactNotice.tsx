export const CONTACT_NOTICE = "非常欢迎向我的邮箱（laoliarthur@outlook.com 或 iii7201027@proton.me）或者微信（bookspiano）留言，说说你的想法，给我提意见！";

export function ContactNotice({ className = "" }: { className?: string }) {
  return <p className={`sans contact-notice text-center ${className}`}>{CONTACT_NOTICE}</p>;
}
