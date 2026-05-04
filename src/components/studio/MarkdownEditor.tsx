"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

function imageAlt(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

export function MarkdownEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/studio/api/media", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() ?? "" },
      body,
    });
    if (!response.ok) return;
    const result = (await response.json()) as { publicPath: string };
    const insertion = `![${imageAlt(file.name)}](${result.publicPath})`;
    onChange(value.trim() ? `${value}\n\n${insertion}` : insertion);
    event.target.value = "";
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-2">
        <span>{label}</span>
        <textarea className="min-h-56 border border-[var(--rule)] bg-white p-3" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
      <label className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs">
        Insert inline image
        <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
      </label>
      <section className="border border-[var(--rule)] bg-white p-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {value || "*No preview yet.*"}
        </ReactMarkdown>
      </section>
    </div>
  );
}
