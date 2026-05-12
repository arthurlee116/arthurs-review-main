"use client";

import { useState } from "react";
import { csrfToken } from "@/lib/client/csrf";

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

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "success"; result: BatchResult };

export function TranslateMissingEnglishButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function translateMissingEnglish() {
    setState({ kind: "running" });
    try {
      const response = await fetch("/studio/api/translations/published-missing", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error ?? `HTTP ${response.status}`;
        setState({ kind: "error", message: `Batch translation failed: ${message}` });
        return;
      }
      const data: BatchResult = await response.json();
      setState({ kind: "success", result: data });
    } catch {
      setState({ kind: "error", message: "Batch translation failed" });
    }
  }

  const MAX_ITEMS = 50;

  return (
    <div className="sans mt-4 border-y border-[var(--rule)] py-4">
      <button
        type="button"
        onClick={translateMissingEnglish}
        disabled={state.kind === "running"}
        className="border border-[var(--rule)] px-4 py-2 disabled:opacity-50"
      >
        {state.kind === "running" ? "Translating..." : "Translate missing English"}
      </button>
      {state.kind === "error" ? <p className="mt-3 text-sm">{state.message}</p> : null}
      {state.kind === "success" ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Attempted {state.result.summary.attempted}. Saved {state.result.summary.succeeded}. Failed{" "}
            {state.result.summary.failed}.
          </p>
          {state.result.successes.slice(0, MAX_ITEMS).map((item) => (
            <p key={`success-${item.id}`}>Saved: {item.titleZh}</p>
          ))}
          {state.result.successes.length > MAX_ITEMS ? (
            <p className="text-[var(--muted)]">...and {state.result.successes.length - MAX_ITEMS} more</p>
          ) : null}
          {state.result.failures.slice(0, MAX_ITEMS).map((item) => (
            <p key={`failure-${item.id}`}>
              Failed: {item.titleZh} - {item.error}
            </p>
          ))}
          {state.result.failures.length > MAX_ITEMS ? (
            <p className="text-[var(--muted)]">...and {state.result.failures.length - MAX_ITEMS} more</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
