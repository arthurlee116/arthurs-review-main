"use client";

import { useState } from "react";

type Settings = {
  siteName: string;
  contactEmail: string;
  about: string;
  featuredArticleId: string;
  rssDescription: string;
};

type ArticleOption = {
  id: number;
  titleZh: string;
};

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

export function SettingsForm({ initialSettings, publishedArticles }: { initialSettings: Settings; publishedArticles: ArticleOption[] }) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/studio/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
      body: JSON.stringify(settings),
    });
    setMessage(response.ok ? "Settings saved" : "Save failed");
  }

  return (
    <section className="sans">
      <h1 className="font-serif text-4xl font-bold">Settings</h1>
      <form onSubmit={save} className="mt-6 grid gap-4">
        {(["siteName", "contactEmail", "rssDescription"] as const).map((key) => (
          <label key={key} className="grid gap-2">
            {key}
            <input className="border border-[var(--rule)] bg-white p-3" value={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} />
          </label>
        ))}
        <label className="grid gap-2">
          featuredArticleId
          <select className="border border-[var(--rule)] bg-white p-3" value={settings.featuredArticleId} onChange={(event) => setSettings({ ...settings, featuredArticleId: event.target.value })}>
            <option value="">No featured article</option>
            {publishedArticles.map((article) => (
              <option key={article.id} value={String(article.id)}>
                {article.titleZh}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          about
          <textarea className="min-h-36 border border-[var(--rule)] bg-white p-3" value={settings.about} onChange={(event) => setSettings({ ...settings, about: event.target.value })} />
        </label>
        <button type="submit" className="w-fit border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)]">
          Save settings
        </button>
        {message ? <p>{message}</p> : null}
      </form>
    </section>
  );
}
