import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { io } from "next/cache";
import { Suspense } from "react";
import { PublicShell } from "@/app/_publicShell";
import { publicPageMetadata } from "@/lib/metadata";
import { getCachedSettings } from "@/lib/services/public-content";

export async function generateMetadata() {
  const locale = await getLocale();
  await io();
  const settings = await getCachedSettings();
  return publicPageMetadata({
    locale,
    title: dictionary(locale).about,
    description: locale === "zh" ? settings.aboutZh : settings.about,
    path: "/about",
  });
}

const englishIntro = [
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

const chineseIntro = [
  { kicker: "技术", body: [
    "我是一个（业余）AI 爱好者，接触过早期聊天机器人、工具调用、本地模型，以及最近的智能体 AI 和运行框架。我用自然语言编程做过几款仅供自己使用的工具，目前正在学习 Python。我通常会较早尝试新工具（比如 OpenClaw），但会认真判断它们的价值，不跟风炒作。",
    "除了 AI，硬件、互联网基础设施和开源生态一直是我最感兴趣的领域。",
  ] },
  { kicker: "人文", body: [
    "我是一名共产主义者。我不是社会民主主义者、自由意志主义者，也不是斯大林主义者。我坚持历史唯物主义，因此不认为马克思或恩格斯的每一句话都完美无缺。在政治和社会问题上，我支持重构家庭结构，并大幅限制父母在养育孩子过程中的作用。",
    "我的阅读范围很广，包括自由主义经典、爱情小说，以及许多其他类型的作品。",
  ], footnote: "我读过《资本论》和《共产党宣言》（不过受能力所限，我的理解还比较有限），也读过马克思、恩格斯及其他著名共产主义者的一些著作。" },
  { kicker: "其他", body: ["我喜欢古典音乐，弹钢琴已经很多年。我喜欢旅行，感受大自然令人惊叹的力量；我还是一个超级吃货，总喜欢尝试新东西。"] },
] as const;

export async function AboutContent({ locale = "zh" }: { locale?: Locale } = {}) {
  await io();
  const settings = await getCachedSettings();
  return (
    <PublicShell locale={locale}>
      <main className="container py-12">
        <section className="reading border-y border-[var(--rule)] py-10">
          <h1 className="text-5xl font-bold">{dictionary(locale).about}</h1>
          <p className="mt-8 text-xl leading-9 text-[var(--muted)]">{locale === "zh" ? settings.aboutZh : settings.about}</p>

          <div className="mt-12">
            {(locale === "zh" ? chineseIntro : englishIntro).map((section) => (
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
            {dictionary(locale).contact}: <a href={`mailto:${settings.contactEmail}`} className="underline decoration-[var(--accent)] decoration-2 underline-offset-4">{settings.contactEmail}</a>
            {" "}{dictionary(locale).or} <a href="mailto:iii7201027@proton.me" className="underline decoration-[var(--accent)] decoration-2 underline-offset-4">iii7201027@proton.me</a>
          </p>
        </section>
      </main>
    </PublicShell>
  );
}

export default async function AboutPage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<PublicShell locale={locale}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <AboutContent locale={locale} />
    </Suspense>
  );
}
