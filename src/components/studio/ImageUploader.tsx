"use client";

import { useState } from "react";

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

export function ImageUploader({ onUploaded }: { onUploaded: (relativePath: string) => void }) {
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("No file chosen");

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/studio/api/media", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() ?? "" },
      body: form,
    });
    const result = (await response.json()) as { relativePath?: string; error?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Upload failed");
      return;
    }
    if (result.relativePath) onUploaded(result.relativePath);
    setMessage("Image uploaded");
  }

  return (
    <div className="grid gap-2">
      <span>Cover image</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs">
          Choose cover image
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
        </label>
        <span className="text-xs text-[var(--muted)]">{fileName}</span>
      </div>
      {message ? <span className="text-xs text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
