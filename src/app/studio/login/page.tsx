// A plain <form method="post"> (no client JS) so the browser's password manager
// sees a real submit and offers to save the credential. The route redirects back
// here with ?error=... on failure. `username` is accepted but never checked.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="studio-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-4xl font-bold">Studio</h1>
      <form method="post" action="/studio/api/auth/login" className="sans grid gap-4">
        <label className="grid gap-2 text-sm">
          Username
          <input className="border border-[var(--rule)] bg-white p-3" type="text" name="username" autoComplete="username" />
        </label>
        <label className="grid gap-2 text-sm">
          Password
          <input className="border border-[var(--rule)] bg-white p-3" type="password" name="password" autoComplete="current-password" />
        </label>
        {error ? <p className="text-sm text-[var(--accent)]">Invalid password</p> : null}
        <button type="submit" className="border border-[var(--rule)] bg-[var(--ink)] p-3 text-white">
          Log in
        </button>
      </form>
    </main>
  );
}
