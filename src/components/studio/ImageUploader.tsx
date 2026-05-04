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

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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
    <label className="grid gap-2">
      <span>Cover image</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
      {message ? <span className="text-xs text-[var(--muted)]">{message}</span> : null}
    </label>
  );
}
