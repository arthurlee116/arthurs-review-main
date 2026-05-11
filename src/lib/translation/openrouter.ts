import { z } from "zod";
import { TranslationOutputSchema, translationJsonSchema, type TranslationOutput } from "./schema";
import type { TranslationMessage } from "./prompt";

const OpenRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
});

export type OpenRouterTranslationRequest = {
  model: string;
  messages: TranslationMessage[];
};

function openRouterKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured.");
  return key;
}

function parseTranslationContent(content: string): TranslationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned invalid JSON.");
  }
  return TranslationOutputSchema.parse(parsed);
}

export async function requestOpenRouterTranslation({
  model,
  messages,
}: OpenRouterTranslationRequest): Promise<TranslationOutput> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "Arthur's Review",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_translation",
          strict: true,
          schema: translationJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with status ${response.status}.`);
  }

  const data = OpenRouterResponseSchema.parse(await response.json());
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter returned empty content.");
  return parseTranslationContent(content);
}
