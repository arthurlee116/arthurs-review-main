import { listPublishedArticlesMissingEnglish, updateArticleEnglishFields } from "@/lib/services/articles";
import { getSetting } from "@/lib/services/settings";
import { requestOpenRouterTranslation } from "./openrouter";
import { buildTranslationMessages } from "./prompt";
import { TranslationInputSchema, type TranslationInput, type TranslationOutput } from "./schema";

export type TranslateFunction = (input: TranslationInput, model: string) => Promise<TranslationOutput>;

export type BatchTranslationResult = {
  summary: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  successes: Array<{ id: number; titleZh: string }>;
  failures: Array<{ id: number; titleZh: string; error: string }>;
};

export function translationModel() {
  return getSetting("openrouterTranslationModel").trim() || "inclusionai/ring-2.6-1t:free";
}

export async function translateArticleDraft(input: TranslationInput, model = translationModel(), translate: TranslateFunction = defaultTranslate) {
  const parsed = TranslationInputSchema.parse(input);
  return translate(parsed, model);
}

async function defaultTranslate(input: TranslationInput, model: string) {
  return requestOpenRouterTranslation({
    model,
    messages: buildTranslationMessages(input),
  });
}

async function translateWithRetry(input: TranslationInput, model: string, translate: TranslateFunction) {
  try {
    return await translate(input, model);
  } catch (firstError) {
    try {
      return await translate(input, model);
    } catch (secondError) {
      throw secondError instanceof Error ? secondError : firstError;
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown translation error.";
}

export async function translatePublishedMissingEnglish({
  model = translationModel(),
  translate = defaultTranslate,
}: {
  model?: string;
  translate?: TranslateFunction;
} = {}): Promise<BatchTranslationResult> {
  const articles = listPublishedArticlesMissingEnglish();
  const result: BatchTranslationResult = {
    summary: {
      attempted: articles.length,
      succeeded: 0,
      failed: 0,
    },
    successes: [],
    failures: [],
  };

  for (const article of articles) {
    try {
      const translation = await translateWithRetry(
        TranslationInputSchema.parse({
          titleZh: article.titleZh,
          excerptZh: article.excerptZh,
          bodyZh: article.bodyZh ?? "",
        }),
        model,
        translate,
      );
      updateArticleEnglishFields(article.id, translation);
      result.summary.succeeded += 1;
      result.successes.push({ id: article.id, titleZh: article.titleZh });
    } catch (error) {
      result.summary.failed += 1;
      result.failures.push({ id: article.id, titleZh: article.titleZh, error: errorMessage(error) });
    }
  }

  return result;
}
