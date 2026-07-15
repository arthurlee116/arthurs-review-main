"use client";

import { useMemo, useRef, useState } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ArticleRenderer } from "@/components/ArticleRenderer";
import { csrfToken } from "@/lib/client/csrf";

const markdownBasicSetup = {
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};

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
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () => [markdown({ base: markdownLanguage }), EditorView.contentAttributes.of({ "aria-label": label })],
    [label],
  );
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
    const view = editorRef.current?.view;
    view?.focus();
    view?.dispatch({
      selection: { anchor: start, head: start + (lines[firstIssue.line - 1]?.length ?? 0) },
      scrollIntoView: true,
    });
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
      <div className="grid gap-2">
        <span>{label}</span>
        <CodeMirror
          ref={editorRef}
          className="markdown-source-editor"
          value={value}
          minHeight="14rem"
          extensions={extensions}
          basicSetup={markdownBasicSetup}
          onChange={onChange}
        />
      </div>
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
        <ArticleRenderer markdown={value || "*No preview yet.*"} />
      </section>
    </div>
  );
}
