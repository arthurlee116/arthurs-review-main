drop table if exists article_search_shadow;

create virtual table article_search_shadow using fts5(
  title_zh,
  title_en,
  excerpt_zh,
  excerpt_en,
  body_zh,
  body_en,
  category,
  tags,
  tokenize='unicode61'
);
