"use client";

import { useState } from "react";
import { csrfToken } from "@/lib/client/csrf";

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function hasImage(transfer: DataTransfer) {
  return (
    Array.from(transfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/")) ||
    Array.from(transfer.files).some(isImageFile)
  );
}

export function ImageUploader({ onUploaded }: { onUploaded: (relativePath: string) => void }) {
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("No file chosen");
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  async function uploadFile(file: File) {
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

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    event.target.value = "";
  }

  return (
    <div
      className={`grid gap-2 border border-transparent transition ${isDraggingImage ? "border-[var(--ink)] bg-white/70 p-3" : ""}`}
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
      aria-label="Cover image drop target"
    >
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
