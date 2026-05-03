import { PublicShell } from "@/app/_publicShell";

export default function NotFound() {
  return (
    <PublicShell>
      <main className="container py-16">
        <section className="reading border-y border-[var(--rule)] py-12">
          <h1 className="text-5xl font-bold">404</h1>
          <p className="sans mt-4 text-sm text-[var(--muted)]">This page does not exist.</p>
        </section>
      </main>
    </PublicShell>
  );
}
