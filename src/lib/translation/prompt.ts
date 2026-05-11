import type { TranslationInput } from "./schema";

export type TranslationMessage = {
  role: "system" | "user";
  content: string;
};

const systemPrompt = [
  "You translate Chinese articles from Arthur's Review into English.",
  "Arthur's Review is a personal political and social commentary publication.",
  "Preserve the author's argument, stance, rhetorical pressure, directness, rhythm, and occasional sharpness.",
  "Keep the English natural and clear for an educated English reader.",
  "Do not soften political judgments.",
  "Do not add new claims, examples, citations, hedging, or explanations.",
  "Do not remove claims just because they are sharp.",
  "Preserve Markdown structure, headings, links, blockquotes, lists, emphasis, and paragraph breaks.",
  "Translate mixed English terms such as stereotypes, PTSD, or named works naturally in context.",
  "Avoid machine-translation stiffness.",
  "Avoid polished institutional media copy.",
  "Return only JSON matching the requested schema.",
].join("\n");

export function buildTranslationMessages(input: TranslationInput): TranslationMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        "Translate this article from Chinese to English.",
        "",
        "<title_zh>",
        input.titleZh,
        "</title_zh>",
        "",
        "<excerpt_zh>",
        input.excerptZh,
        "</excerpt_zh>",
        "",
        "<body_zh_markdown>",
        input.bodyZh,
        "</body_zh_markdown>",
      ].join("\n"),
    },
  ];
}
