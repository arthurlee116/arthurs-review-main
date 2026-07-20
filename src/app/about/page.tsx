import { io } from "next/cache";
import { Suspense } from "react";
import { PublicShell } from "@/app/_publicShell";
import { publicPageMetadata } from "@/lib/metadata";
import { getCachedSettings } from "@/lib/services/public-content";

export async function generateMetadata() {
  await io();
  const settings = await getCachedSettings();
  return publicPageMetadata({
    title: "About",
    description: settings.about,
    path: "/about",
  });
}

export async function AboutContent() {
  await io();
  const settings = await getCachedSettings();
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

export default function AboutPage() {
  return (
    <Suspense fallback={<PublicShell><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <AboutContent />
    </Suspense>
  );
}
