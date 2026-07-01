const notice = "非常欢迎向我的邮箱（laoliarthur@outlook.com）或者微信（bookspiano）留言，说说你的想法，给我提意见！";

export function ContactNotice({ className = "" }: { className?: string }) {
  return <p className={`sans text-center text-xs leading-6 text-[var(--muted)] ${className}`}>{notice}</p>;
}
