-- Life posts also need historical URLs when their slug or category changes.
alter table article_url_history rename to article_url_history_legacy;

create table article_url_history (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  category text not null check (category in ('commentary', 'society', 'misc', 'life')),
  slug text not null,
  created_at text not null,
  unique(category, slug)
);

insert into article_url_history(id, article_id, category, slug, created_at)
select id, article_id, category, slug, created_at from article_url_history_legacy order by id;

drop table article_url_history_legacy;
create index article_url_history_article_idx on article_url_history(article_id, id desc);
