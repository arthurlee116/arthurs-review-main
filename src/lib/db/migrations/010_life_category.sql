-- SQLite rewrites FK references and trigger bodies when a table is renamed, which
-- would leave articles (and its revision-ownership triggers) pointing at the legacy
-- name after the rebuild. legacy_alter_table disables that rewriting so only the
-- table itself is renamed. The migration runner already runs this with
-- foreign_keys off, which is required while the legacy table is dropped because
-- articles references it by name in between.
pragma legacy_alter_table = on;

alter table article_revisions rename to article_revisions_legacy;

create table article_revisions (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  created_at text not null,
  title_zh text not null,
  title_en text,
  slug text not null,
  category text not null check (category in ('commentary', 'society', 'misc', 'life')),
  excerpt_zh text not null default '',
  excerpt_en text,
  cover_image_path text,
  seo_description text not null default '',
  body_zh_path text not null,
  body_en_path text
);

insert into article_revisions(
  id, article_id, created_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
  cover_image_path, seo_description, body_zh_path, body_en_path
)
select
  id, article_id, created_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
  cover_image_path, seo_description, body_zh_path, body_en_path
from article_revisions_legacy
order by id;

drop table article_revisions_legacy;

create index article_revisions_article_idx on article_revisions(article_id, id desc);
create index article_revisions_path_idx on article_revisions(category, slug);

pragma legacy_alter_table = off;
