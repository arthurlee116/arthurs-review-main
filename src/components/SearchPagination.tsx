import { PageNavigation } from "./PageNavigation";
import { dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
import type { SearchArticleResultsPage } from "@/lib/services/search";
export function SearchPagination({ resultPage, locale = "zh" }: { resultPage: SearchArticleResultsPage; locale?: Locale }) {
  return <PageNavigation basePath="/search" page={resultPage.page} totalPages={resultPage.totalPages} params={{ q: resultPage.query }} label={dictionary(locale).searchPages} locale={locale} />;
}
