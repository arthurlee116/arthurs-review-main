"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/studio/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      setError("Invalid password");
      return;
    }
    router.push("/studio/articles");
  }

  return (
    <main className="studio-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-4xl font-bold">Studio</h1>
      <form onSubmit={submit} className="sans grid gap-4">
        {/* Cosmetic: the server only checks the password. The field exists so the
            browser's password manager has a username to save the credential under. */}
        <label className="grid gap-2 text-sm">
          Username
          <input className="border border-[var(--rule)] bg-white p-3" type="text" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm">
          Password
          <input className="border border-[var(--rule)] bg-white p-3" type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
        <button type="submit" className="border border-[var(--rule)] bg-[var(--ink)] p-3 text-white">
          Log in
        </button>
      </form>
    </main>
  );
}
