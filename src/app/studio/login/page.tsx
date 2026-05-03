"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/studio/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError("Invalid password");
      return;
    }
    router.push("/studio/articles");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-4xl font-bold">Studio</h1>
      <form onSubmit={submit} className="sans grid gap-4">
        <label className="grid gap-2 text-sm">
          Password
          <input className="border border-[var(--rule)] bg-white p-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
        <button className="border border-[var(--rule)] bg-[var(--ink)] p-3 text-white">Log in</button>
      </form>
    </main>
  );
}
