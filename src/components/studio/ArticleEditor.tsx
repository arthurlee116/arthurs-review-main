"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Article } from "@/lib/services/articles";
import { ImageUploader } from "./ImageUploader";
import { MarkdownEditor } from "./MarkdownEditor";
import { TagPicker } from "./TagPicker";

type TagOption = { id: number; name: string; slug: string };

type FormState = {
  id?: number;
  status?: "draft" | "published";
  titleZh: string;
  titleEn: string;
  slug: string;
  category: "commentary" | "society" | "misc";
  excerptZh: string;
  excerptEn: string;
  seoDescription: string;
  bodyZh: string;
  bodyEn: string;
  tagIds: number[];
  coverImagePath: string;
};

type ApiError = { error?: string };

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

function initial(article?: Article): FormState {
  return {
    id: article?.id,
    status: article?.status,
    titleZh: article?.titleZh ?? "",
    titleEn: article?.titleEn ?? "",
    slug: article?.slug ?? "",
    category: article?.category ?? "commentary",
    excerptZh: article?.excerptZh ?? "",
    excerptEn: article?.excerptEn ?? "",
    seoDescription: article?.seoDescription ?? "",
    bodyZh: article?.bodyZh ?? "",
    bodyEn: article?.bodyEn ?? "",
    tagIds: article?.tags.map((tag) => tag.id) ?? [],
    coverImagePath: article?.coverImagePath ?? "",
  };
}

export function ArticleEditor({ article, availableTags = [] }: { article?: Article; availableTags?: TagOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initial(article));
  const [message, setMessage] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setMessage("");
    const payload = {
      titleZh: form.titleZh,
      titleEn: form.titleEn || null,
      slug: form.slug,
      category: form.category,
      excerptZh: form.excerptZh,
      excerptEn: form.excerptEn || null,
      seoDescription: form.seoDescription,
      bodyZh: form.bodyZh,
      bodyEn: form.bodyEn || null,
      tagIds: form.tagIds,
      coverImagePath: form.coverImagePath || null,
    };
    const response = await fetch(form.id ? `/studio/api/articles/${form.id}` : "/studio/api/articles", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(data.error ? `Save failed: ${data.error}` : "Save failed");
      return null;
    }
    const data = (await response.json()) as { article: Article };
    setForm(initial(data.article));
    setMessage("Draft saved");
    router.refresh();
    return data.article;
  }

  async function publish() {
    const saved = await save();
    if (!saved) return;
    const response = await fetch(`/studio/api/articles/${saved.id}/publish`, {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() ?? "" },
    });
    if (response.ok) {
      const data = (await response.json()) as { article: Article };
      setForm(initial(data.article));
      setMessage("Published");
    } else {
      const data = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(data.error ? `Publish failed: ${data.error}` : "Publish failed");
    }
    router.refresh();
  }

  async function unpublish() {
    if (!form.id) return;
    setMessage("");
    const response = await fetch(`/studio/api/articles/${form.id}/unpublish`, {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() ?? "" },
    });
    if (response.ok) {
      const data = (await response.json()) as { article: Article };
      setForm(initial(data.article));
      setMessage("Unpublished");
    } else {
      setMessage("Unpublish failed");
    }
    router.refresh();
  }

  return (
    <div className="sans grid gap-5 text-sm">
      <label className="grid gap-2">
        Chinese title
        <input className="border border-[var(--rule)] bg-white p-3" value={form.titleZh} onChange={(event) => set("titleZh", event.target.value)} />
      </label>
      <label className="grid gap-2">
        English title
        <input className="border border-[var(--rule)] bg-white p-3" value={form.titleEn} onChange={(event) => set("titleEn", event.target.value)} />
      </label>
      <label className="grid gap-2">
        Slug
        <input className="border border-[var(--rule)] bg-white p-3" value={form.slug} onChange={(event) => set("slug", event.target.value)} />
        <span className="text-xs text-[var(--muted)]">
          Required: use lowercase English letters, numbers, and single hyphens only. Good: test-draft-1. Bad: 中文、spaces、UPPERCASE、under_scores.
        </span>
      </label>
      <label className="grid gap-2">
        Category
        <select className="border border-[var(--rule)] bg-white p-3" value={form.category} onChange={(event) => set("category", event.target.value as FormState["category"])}>
          <option value="commentary">时事评论</option>
          <option value="society">社会分析</option>
          <option value="misc">杂七杂八</option>
        </select>
      </label>
      <label className="grid gap-2">
        Chinese excerpt
        <textarea className="min-h-24 border border-[var(--rule)] bg-white p-3" value={form.excerptZh} onChange={(event) => set("excerptZh", event.target.value)} />
      </label>
      <label className="grid gap-2">
        SEO description
        <input className="border border-[var(--rule)] bg-white p-3" value={form.seoDescription} onChange={(event) => set("seoDescription", event.target.value)} />
      </label>
      <ImageUploader onUploaded={(relativePath) => set("coverImagePath", relativePath)} />
      <TagPicker tags={availableTags} tagIds={form.tagIds} onChange={(tagIds) => set("tagIds", tagIds)} />
      <p className="text-xs text-[var(--muted)]">Required before publishing: Chinese title, valid slug, and Chinese body.</p>
      <MarkdownEditor label="Chinese body" value={form.bodyZh} onChange={(value) => set("bodyZh", value)} />
      <MarkdownEditor label="English body" value={form.bodyEn} onChange={(value) => set("bodyEn", value)} />
      <div className="flex flex-wrap gap-3">
        <button onClick={save} className="border border-[var(--rule)] px-4 py-2">
          Save draft
        </button>
        {form.id ? (
          <a className="border border-[var(--rule)] px-4 py-2" href={`/studio/preview/${form.id}`} target="_blank">
            Preview
          </a>
        ) : null}
        <button onClick={publish} className="border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)]">
          Publish
        </button>
        {form.status === "published" ? (
          <button onClick={unpublish} className="border border-[var(--rule)] px-4 py-2">
            Unpublish
          </button>
        ) : null}
      </div>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
