"use client";

import { useEffect, useState } from "react";
import { csrfToken } from "@/lib/client/csrf";

type BatchProgress = {
  id: string;
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  dead: number;
};

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "active"; batch: BatchProgress }
  | { kind: "error"; message: string };

function finished(batch: BatchProgress) {
  return batch.queued + batch.running === 0;
}

export function TranslateMissingEnglishButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "active" || finished(state.batch)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/studio/api/translations/published-missing?batch=${encodeURIComponent(state.batch.id)}`, {
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null) as { batch?: BatchProgress; error?: string } | null;
        if (!response.ok || !body?.batch) throw new Error(body?.error ?? `HTTP ${response.status}`);
        setState({ kind: "active", batch: body.batch });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ kind: "error", message: `Batch progress failed: ${error instanceof Error ? error.message : "unknown error"}` });
        }
      }
    }, 1_000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state]);

  async function translateMissingEnglish() {
    setState({ kind: "starting" });
    try {
      const response = await fetch("/studio/api/translations/published-missing", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      const body = await response.json().catch(() => null) as { batch?: BatchProgress; error?: string } | null;
      if (response.status !== 202 || !body?.batch) {
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setState({ kind: "active", batch: body.batch });
    } catch (error) {
      setState({ kind: "error", message: `Batch translation failed: ${error instanceof Error ? error.message : "unknown error"}` });
    }
  }

  const running = state.kind === "starting" || (state.kind === "active" && !finished(state.batch));

  return (
    <div className="sans mt-4 border-y border-[var(--rule)] py-4">
      <button
        type="button"
        onClick={translateMissingEnglish}
        disabled={running}
        className="border border-[var(--rule)] px-4 py-2 disabled:opacity-50"
      >
        {state.kind === "starting" ? "Queuing..." : running ? "Translation running..." : "Translate missing English"}
      </button>
      {state.kind === "error" ? <p className="mt-3 text-sm">{state.message}</p> : null}
      {state.kind === "active" ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Queued {state.batch.queued}. Running {state.batch.running}. Completed {state.batch.succeeded}. Failed {state.batch.dead}.
          </p>
          {state.batch.total === 0 ? <p>No published articles are missing English.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
