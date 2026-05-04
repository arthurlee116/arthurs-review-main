"use client";

import { useState } from "react";

type Tag = { id: number; name: string; slug: string };

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

export function TagsManager({ initialTags }: { initialTags: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [name, setName] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/studio/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const data = (await response.json()) as { tag: Tag };
      setTags((current) => [...current, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    }
  }

  return (
    <section className="sans">
      <h1 className="font-serif text-4xl font-bold">Tags</h1>
      <form onSubmit={create} className="mt-6 flex gap-3">
        <input className="border border-[var(--rule)] bg-white p-3" value={name} onChange={(event) => setName(event.target.value)} aria-label="Tag name" />
        <button type="submit" className="border border-[var(--rule)] px-4">
          Create tag
        </button>
      </form>
      <ul className="mt-6 grid gap-2">
        {tags.map((tag) => (
          <li key={tag.id}>
            {tag.id}. {tag.name} / {tag.slug}
          </li>
        ))}
      </ul>
    </section>
  );
}
