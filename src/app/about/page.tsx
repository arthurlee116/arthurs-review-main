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

const selfIntro = [
  {
    kicker: "Technical",
    body: [
      "I am an (amateur) AI enthusiast, with experience spanning early chatbots, tool calling, local models, and most recently, agentic AI and harnesses. I have vibe-coded a few tools for personal use ONLY and am currently learning Python. I am usually an early adopter (e.g., OpenClaw), but I evaluate new tools critically and stay out of the damn hype.",
      "Aside from AI, hardware, internet infra, and the open-source ecosystem have always occupied the top spots of my interest list.",
    ],
  },
  {
    kicker: "Humanities",
    body: [
      "I am a Communist. Not a social democrat, libertarian, or Stalinist. I uphold the principles of historical materialism, so I do not consider every statement by Marx or Engels to be perfect. Politically and socially, I support the reconstruction of the family structure and extensively limiting parents' role in child-rearing.",
      "I read widely across genres, including classic liberal texts, romance fiction, and many others.",
    ],
    footnote:
      "I have read Das Kapital and the Communist Manifesto (although my understanding is fairly limited due to my abilities) and some other writings of Marx and Engels, as well as other well-known communists.",
  },
  {
    kicker: "Other",
    body: [
      "I enjoy classical music and have played the piano for a long time. I love traveling to experience the awe of nature, and I am a massive foooooooodie who always loves to try new things.",
    ],
  },
] as const;

export async function AboutContent() {
  await io();
  const settings = await getCachedSettings();
  return (
    <PublicShell>
      <main className="container py-12">
        <section className="reading border-y border-[var(--rule)] py-10">
          <h1 className="text-5xl font-bold">About</h1>
          <p className="mt-8 text-xl leading-9 text-[var(--muted)]">{settings.about}</p>

          <div className="mt-12">
            {selfIntro.map((section) => (
              <section key={section.kicker} className="border-t border-[var(--rule)] py-8">
                <h2 className="sans flex items-center gap-3 text-xs font-bold uppercase tracking-[0.14em]">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-[var(--accent)]" />
                  {section.kicker}
                </h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="mt-5 text-lg leading-8">
                    {paragraph}
                  </p>
                ))}
                {"footnote" in section ? (
                  <p className="mt-6 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--muted)]">
                    {section.footnote}
                  </p>
                ) : null}
              </section>
            ))}
          </div>

          <p className="sans mt-8 border-t border-[var(--rule)] pt-8 text-sm">
            Contact: <a href={`mailto:${settings.contactEmail}`} className="underline decoration-[var(--accent)] decoration-2 underline-offset-4">{settings.contactEmail}</a>
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
