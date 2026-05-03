"use client";

export function MarkdownEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span>{label}</span>
      <textarea className="min-h-56 border border-[var(--rule)] bg-white p-3" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
