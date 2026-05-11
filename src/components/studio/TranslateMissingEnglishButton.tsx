"use client";

import { useState } from "react";

type BatchResult = {
  summary: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  successes: Array<{ id: number; titleZh: string }>;
  failures: Array<{ id: number; titleZh: string; error: string }>;
  error?: string;
};

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

export function TranslateMissingEnglishButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [message, setMessage] = useState("");

  async function translateMissingEnglish() {
    setIsRunning(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/studio/api/translations/published-missing", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      const data = (await response.json().catch(() => ({}))) as BatchResult;
      if (!response.ok) {
        setMessage(data.error ? `Batch translation failed: ${data.error}` : "Batch translation failed");
        return;
      }
      setResult(data);
    } catch {
      setMessage("Batch translation failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="sans mt-4 border-y border-[var(--rule)] py-4">
      <button type="button" onClick={translateMissingEnglish} disabled={isRunning} className="border border-[var(--rule)] px-4 py-2 disabled:opacity-50">
        {isRunning ? "Translating..." : "Translate missing English"}
      </button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {result ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Attempted {result.summary.attempted}. Saved {result.summary.succeeded}. Failed {result.summary.failed}.
          </p>
          {result.successes.map((item) => (
            <p key={`success-${item.id}`}>Saved: {item.titleZh}</p>
          ))}
          {result.failures.map((item) => (
            <p key={`failure-${item.id}`}>
              Failed: {item.titleZh} - {item.error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
