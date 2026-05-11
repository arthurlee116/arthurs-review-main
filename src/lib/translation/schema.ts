import { z } from "zod";

export const TranslationInputSchema = z.object({
  titleZh: z.string().min(1),
  excerptZh: z.string(),
  bodyZh: z.string().min(1),
});

export const TranslationOutputSchema = z.object({
  titleEn: z.string().min(1),
  excerptEn: z.string(),
  bodyEn: z.string().min(1),
});

export type TranslationInput = z.infer<typeof TranslationInputSchema>;
export type TranslationOutput = z.infer<typeof TranslationOutputSchema>;

export const translationJsonSchema = {
  type: "object",
  properties: {
    titleEn: {
      type: "string",
      description: "Natural English translation of the Chinese title.",
    },
    excerptEn: {
      type: "string",
      description: "Natural English translation of the Chinese takeaway or excerpt.",
    },
    bodyEn: {
      type: "string",
      description: "Natural English Markdown translation of the Chinese body.",
    },
  },
  required: ["titleEn", "excerptEn", "bodyEn"],
  additionalProperties: false,
} as const;
