"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { csrfToken } from "@/lib/client/csrf";
import { buildLifePost, type UploadedMedia } from "@/lib/studio/life-post";
import { precompressImage } from "@/lib/studio/precompress";

const MAX_FILES = 10;
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,image/gif,image/avif,video/mp4,video/quicktime,video/webm,.heic,.heif,.gif,.avif";

type MediaItem = {
  id: string;
  file: File;
  status: "compressing" | "uploading" | "done" | "failed";
  error?: string;
  uploaded?: UploadedMedia;
};

type MediaApiResult = UploadedMedia & { error?: string };

function isVideo(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name);
}

function statusLabel(item: MediaItem) {
  if (item.status === "compressing") return "压缩中…";
  if (item.status === "uploading") return isVideo(item.file) ? "转码中…（视频可能需要一分钟）" : "上传中…";
  if (item.status === "failed") return item.error ?? "上传失败";
  return item.file.name;
}

export function LifeQuickPost() {
  const router = useRouter();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const counter = useRef(0);

  function patchItem(id: string, patch: Partial<MediaItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadItem(item: MediaItem) {
    try {
      patchItem(item.id, { status: isVideo(item.file) ? "uploading" : "compressing", error: undefined });
      const prepared = isVideo(item.file) ? item.file : await precompressImage(item.file);
      patchItem(item.id, { status: "uploading" });

      const form = new FormData();
      form.append("file", prepared);
      const response = await fetch("/studio/api/media", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
        body: form,
      });
      const result = (await response.json()) as MediaApiResult;
      if (!response.ok) {
        patchItem(item.id, { status: "failed", error: result.error ?? "上传失败" });
        return;
      }
      patchItem(item.id, {
        status: "done",
        uploaded: {
          kind: result.kind,
          publicPath: result.publicPath,
          coverPublicPath: result.coverPublicPath,
          relativePath: result.relativePath,
          coverRelativePath: result.coverRelativePath,
        },
      });
    } catch {
      patchItem(item.id, { status: "failed", error: "上传失败" });
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    setMessage("");
    setItems((current) => {
      const room = MAX_FILES - current.length;
      if (files.length > room) setMessage(`最多 10 个文件，已忽略超出的 ${files.length - room} 个`);
      const accepted = files.slice(0, Math.max(0, room)).map((file) => {
        counter.current += 1;
        return { id: `m${counter.current}`, file, status: "compressing" as const };
      });
      for (const item of accepted) void uploadItem(item);
      return [...current, ...accepted];
    });
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const pending = items.some((item) => item.status !== "done");
  const canPublish = items.length > 0 && !pending && !isPublishing;

  async function publish() {
    setIsPublishing(true);
    setMessage("");
    try {
      const media = items.map((item) => item.uploaded!);
      const post = buildLifePost(media, caption, new Date());
      const create = await fetch("/studio/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
        body: JSON.stringify({
          titleZh: post.titleZh,
          titleEn: null,
          slug: post.slug,
          category: "life",
          excerptZh: post.excerptZh,
          excerptEn: null,
          seoDescription: "",
          bodyZh: post.bodyZh,
          bodyEn: null,
          tagIds: [],
          coverImagePath: post.coverImagePath,
        }),
      });
      if (!create.ok) {
        const data = (await create.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ? `发布失败：${data.error}` : "发布失败");
        return;
      }
      const { article } = (await create.json()) as { article: { id: number } };
      const publishResponse = await fetch(`/studio/api/articles/${article.id}/publish`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      if (!publishResponse.ok) {
        const data = (await publishResponse.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ? `发布失败：${data.error}` : "发布失败");
        return;
      }
      router.push("/life");
    } catch {
      setMessage("发布失败");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="sans grid min-w-0 gap-5 text-sm">
      <label className="studio-button grid w-full cursor-pointer place-items-center gap-2 border border-dashed border-[var(--rule)] p-10 text-center">
        <span>选择照片或视频（最多 10 个）</span>
        <span className="text-xs text-[var(--muted)]">支持 HEIC/AVIF/GIF 等格式；图片自动压缩，视频在服务器转码，可能需要一分钟</span>
        <input
          aria-label="Choose photos or videos"
          className="sr-only"
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {items.length ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 border border-[var(--rule)] px-3 py-2">
              <span className="sans text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                {isVideo(item.file) ? "视频" : "图片"}
              </span>
              <span className={item.status === "failed" ? "text-red-700" : "text-[var(--muted)]"}>{statusLabel(item)}</span>
              <span className="ml-auto flex gap-2">
                {item.status === "failed" ? (
                  <button type="button" className="text-xs underline" onClick={() => void uploadItem(item)}>
                    重试
                  </button>
                ) : null}
                <button type="button" className="text-xs underline" onClick={() => removeItem(item.id)}>
                  移除
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="grid gap-2">
        Caption（可留空）
        <textarea
          aria-label="Caption"
          className="min-h-24 border border-[var(--rule)] bg-white p-3"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />
      </label>

      <button
        type="button"
        disabled={!canPublish}
        onClick={publish}
        className="studio-button w-fit border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)] disabled:opacity-50"
      >
        {isPublishing ? "发布中…" : "发布"}
      </button>
      {items.length > 0 && pending ? <p className="text-xs text-[var(--muted)]">还有媒体未就绪</p> : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}
