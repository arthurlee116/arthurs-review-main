// Insert spaces between consecutive CJK characters so the unicode61 tokenizer
// treats each as a separate token (unicode61 groups contiguous CJK into one token).
// Used both when populating article_search during migrations and when syncing at runtime.
export function tokenizeForFts(text: string): string {
  return text
    .replace(/([\p{Script=Han}])/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}
