"use client";

export function PendingButton({ children }: { children: React.ReactNode }) {
  return <button className="border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)]">{children}</button>;
}
