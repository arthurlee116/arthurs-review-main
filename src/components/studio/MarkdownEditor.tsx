"use client";

import { useRef, useState } from "react";
import { csrfToken } from "@/lib/client/csrf";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function imageAlt(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function hasImage(transfer: DataTransfer) {
  return (
    Array.from(transfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/")) ||
    Array.from(transfer.files).some(isImageFile)
  );
}

function markerCount(line: string, marker: "*" | "_") {
  const escaped = marker === "*" ? "\\*" : "_";
  return (line.match(new RegExp(`(?<!${escaped})${escaped}(?!${escaped})`, "g")) ?? []).length;
}

function charCount(line: string, char: string) {
  return Array.from(line).filter((value) => value === char).length;
}

type MarkdownIssue = { line: number; message: string };

function markdownIssues(markdown: string) {
  const issues: MarkdownIssue[] = [];
  let fenceStart: number | null = null;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      fenceStart = fenceStart === null ? lineNumber : null;
      return;
    }
    if (fenceStart !== null) return;
    const heading = trimmed.match(/^(#{1,6})(.*)$/);
    if (heading && !heading[2].startsWith(" ")) issues.push({ line: lineNumber, message: "Add a space after heading markers." });
    const emphasisLine = line.replace(/^\s*[-*+]\s+/, "");
    if ((markerCount(emphasisLine, "*") + markerCount(emphasisLine, "_")) % 2 === 1) issues.push({ line: lineNumber, message: "Check unmatched emphasis markers." });
    if ((line.includes("[") || line.includes("]") || line.includes("(") || line.includes(")")) && (charCount(line, "[") !== charCount(line, "]") || charCount(line, "(") !== charCount(line, ")"))) {
      issues.push({ line: lineNumber, message: "Check mismatched link brackets." });
    }
  });

  if (fenceStart !== null) issues.push({ line: fenceStart, message: "Close this fenced code block." });
  return issues;
}

export function MarkdownEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [message, setMessage] = useState("");
  const [checkResult, setCheckResult] = useState<MarkdownIssue[] | null>(null);

  async function uploadFile(file: File) {
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
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    event.target.value = "";
  }

  async function importMarkdown(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCheckResult(null);
    if (value.trim()) {
      setMessage("Clear this body before importing Markdown.");
      event.target.value = "";
      return;
    }
    onChange(await file.text());
    setMessage(`Imported ${file.name}`);
    event.target.value = "";
  }

  function checkMarkdown() {
    const issues = markdownIssues(value);
    setMessage("");
    setCheckResult(issues);
    const firstIssue = issues[0];
    if (!firstIssue) return;
    const lines = value.split(/\r?\n/);
    const start = lines.slice(0, firstIssue.line - 1).reduce((offset, line) => offset + line.length + 1, 0);
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(start, start + (lines[firstIssue.line - 1]?.length ?? 0));
  }

  return (
    <div
      className={`grid gap-3 border border-transparent p-0 transition ${
        isDraggingImage ? "border-[var(--ink)] bg-white/70 p-3" : ""
      }`}
      onDragEnter={(event) => {
        if (!hasImage(event.dataTransfer)) return;
        event.preventDefault();
        setIsDraggingImage(true);
      }}
      onDragOver={(event) => {
        if (!hasImage(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDraggingImage(false);
      }}
      onDrop={async (event) => {
        if (!hasImage(event.dataTransfer)) return;
        event.preventDefault();
        setIsDraggingImage(false);
        const file = Array.from(event.dataTransfer.files).find(isImageFile);
        if (file) await uploadFile(file);
      }}
      aria-label={`${label} image drop target`}
    >
      <label className="grid gap-2">
        <span>{label}</span>
        <textarea ref={textareaRef} className="min-h-56 border border-[var(--rule)] bg-white p-3" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs">
          Insert inline image
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
        </label>
        <label className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs">
          Import Markdown
          <input className="sr-only" type="file" accept=".md,.markdown,text/markdown" onChange={importMarkdown} />
        </label>
        <button type="button" className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs" onClick={checkMarkdown}>
          Check Markdown
        </button>
      </div>
      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
      {checkResult?.length ? (
        <ul className="grid gap-1 text-xs text-[var(--muted)]">
          {checkResult.map((issue) => (
            <li key={`${issue.line}-${issue.message}`}>{`Line ${issue.line}: ${issue.message}`}</li>
          ))}
        </ul>
      ) : null}
      {checkResult && checkResult.length === 0 ? <p className="text-xs text-[var(--muted)]">Markdown looks clean.</p> : null}
      <section className="grid gap-3 border border-[var(--rule)] bg-white p-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            h1: ({ children }) => <h1 className="text-2xl font-bold leading-tight">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-bold leading-tight">{children}</h2>,
            h3: ({ children }) => <h3 className="text-lg font-bold leading-tight">{children}</h3>,
            p: ({ children }) => <p className="leading-7">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-6">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-6">{children}</ol>,
            li: ({ children }) => <li className="my-1">{children}</li>,
            a: ({ children, href }) => (
              <a className="underline underline-offset-2" href={href}>
                {children}
              </a>
            ),
            code: ({ children }) => <code className="bg-[var(--paper)] px-1">{children}</code>,
            pre: ({ children }) => <pre className="overflow-auto border border-[var(--rule)] bg-[var(--paper)] p-3">{children}</pre>,
            blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--rule)] pl-4 text-[var(--muted)]">{children}</blockquote>,
          }}
        >
          {value || "*No preview yet.*"}
        </ReactMarkdown>
      </section>
    </div>
  );
}
