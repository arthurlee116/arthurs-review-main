import Link from "next/link";

export function LanguageSwitch({ hasEnglish, currentPath }: { hasEnglish: boolean; currentPath: string }) {
  if (!hasEnglish) return null;
  return (
    <span className="sans mt-3 inline-block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
      <Link href={currentPath}>中文</Link>
      <span className="mx-2">/</span>
      <Link href={`${currentPath}?lang=en`}>English</Link>
    </span>
  );
}
