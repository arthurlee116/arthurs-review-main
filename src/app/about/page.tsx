import { PublicShell } from "@/app/_publicShell";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  const settings = getSettings();
  return (
    <PublicShell>
      <main className="container py-12">
        <section className="reading border-y border-[var(--rule)] py-10">
          <h1 className="text-5xl font-bold">About</h1>
          <p className="mt-8 text-xl leading-9 text-[var(--muted)]">{settings.about}</p>
          <p className="sans mt-8 text-sm">
            Contact: <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
