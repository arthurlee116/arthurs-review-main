"use client";

import { useRef, useState } from "react";
import { csrfToken } from "@/lib/client/csrf";
import { precompressImage } from "@/lib/studio/precompress";

function isConnectionError(error: unknown) {
  return error instanceof Error && ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
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

export function ImageUploader({ onUploaded, onBusyChange }: {
  onUploaded: (relativePath: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const busy = useRef(false);
  const [fileName, setFileName] = useState("No file chosen");
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  async function uploadFile(file: File) {
    if (busy.current) return;
    busy.current = true;
    setIsUploading(true);
    onBusyChange?.(true);
    setFileName(file.name);
    setMessage("Preparing image...");
    try {
      const prepared = await precompressImage(file);
      if (prepared.size > 8 * 1024 * 1024) throw new Error("Image must be 8 MB or smaller.");
      const form = new FormData();
      form.append("file", prepared);
      setMessage("Uploading image...");
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch("/studio/api/media", {
            method: "POST",
            headers: { "x-csrf-token": csrfToken() ?? "" },
            body: form,
            signal: AbortSignal.timeout(45_000),
          });
          const result = (await response.json().catch((error: unknown) => {
            if (isConnectionError(error)) throw error;
            return null;
          })) as { relativePath?: string; error?: string } | null;
          if (!response.ok) throw new Error(result?.error ?? `Upload failed (${response.status}). Choose the image to retry.`);
          if (!result?.relativePath) throw new Error("Invalid upload response. Choose the image to retry.");
          onUploaded(result.relativePath);
          setMessage("Image uploaded");
          return;
        } catch (error) {
          // A stale browser connection can fail before Caddy ever sees the POST.
          if (attempt === 0 && isConnectionError(error)) {
            setMessage("Connection interrupted. Retrying upload...");
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      setMessage(isConnectionError(error)
        ? "Upload connection failed or timed out. Choose the image to retry."
        : error instanceof Error ? error.message : "Upload failed. Choose the image to retry.");
    } finally {
      busy.current = false;
      setIsUploading(false);
      onBusyChange?.(false);
    }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset before awaiting so the same file remains selectable after a failure.
    event.target.value = "";
    if (!file) return;
    await uploadFile(file);
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
      aria-busy={isUploading}
    >
      <span>Cover image</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="studio-button w-fit border border-[var(--rule)] px-3 py-2 text-xs">
          Choose cover image
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={isUploading} />
        </label>
        <span className="text-xs text-[var(--muted)]">{fileName}</span>
      </div>
      <span role="status" className="text-xs text-[var(--muted)]">{message}</span>
    </div>
  );
}
