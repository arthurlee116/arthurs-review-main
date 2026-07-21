create table article_url_history (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  category text not null check (category in ('commentary', 'society', 'misc')),
  slug text not null,
  created_at text not null,
  unique(category, slug)
);

create index article_url_history_article_idx on article_url_history(article_id, id desc);
