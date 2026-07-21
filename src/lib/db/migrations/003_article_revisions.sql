drop index if exists articles_status_published_idx;
drop index if exists articles_category_status_idx;

alter table articles rename to articles_legacy;
alter table article_tags rename to article_tags_legacy;

create table articles (
  id integer primary key autoincrement,
  draft_revision_id integer references article_revisions(id),
  published_revision_id integer references article_revisions(id),
  published_at text,
  updated_at text not null,
  is_featured integer not null default 0 check (is_featured in (0, 1))
);

create table article_revisions (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  created_at text not null,
  title_zh text not null,
  title_en text,
  slug text not null,
  category text not null check (category in ('commentary', 'society', 'misc')),
  excerpt_zh text not null default '',
  excerpt_en text,
  cover_image_path text,
  seo_description text not null default '',
  body_zh_path text not null,
  body_en_path text
);

create table article_revision_tags (
  revision_id integer not null references article_revisions(id) on delete cascade,
  tag_id integer not null references tags(id) on delete cascade,
  primary key(revision_id, tag_id)
);

insert into articles(id, published_at, updated_at, is_featured)
select id, published_at, updated_at, is_featured
from articles_legacy;

insert into article_revisions(
  article_id, created_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
  cover_image_path, seo_description, body_zh_path, body_en_path
)
select
  id, updated_at, title_zh, title_en, slug, category, excerpt_zh, excerpt_en,
  cover_image_path, seo_description, body_zh_path, body_en_path
from articles_legacy
order by id;

insert into article_revision_tags(revision_id, tag_id)
select article_revisions.id, article_tags_legacy.tag_id
from article_tags_legacy
join article_revisions on article_revisions.article_id = article_tags_legacy.article_id;

update articles
set draft_revision_id = (
      select article_revisions.id from article_revisions where article_revisions.article_id = articles.id
    ),
    published_revision_id = case
      when (select status from articles_legacy where articles_legacy.id = articles.id) = 'published'
      then (select article_revisions.id from article_revisions where article_revisions.article_id = articles.id)
      else null
    end;

drop table article_tags_legacy;
drop table articles_legacy;

create index articles_published_idx on articles(published_revision_id, published_at desc, id desc);
create index articles_updated_idx on articles(updated_at desc, id desc);
create index article_revisions_article_idx on article_revisions(article_id, id desc);
create index article_revisions_path_idx on article_revisions(category, slug);
create index article_revision_tags_tag_idx on article_revision_tags(tag_id, revision_id);

create trigger articles_draft_revision_owner_insert
before insert on articles
when new.draft_revision_id is not null
  and not exists (
    select 1 from article_revisions
    where id = new.draft_revision_id and article_id = new.id
  )
begin
  select raise(abort, 'draft revision belongs to another article');
end;

create trigger articles_draft_revision_owner_update
before update of draft_revision_id on articles
when new.draft_revision_id is not null
  and not exists (
    select 1 from article_revisions
    where id = new.draft_revision_id and article_id = new.id
  )
begin
  select raise(abort, 'draft revision belongs to another article');
end;

create trigger articles_published_revision_owner_insert
before insert on articles
when new.published_revision_id is not null
  and not exists (
    select 1 from article_revisions
    where id = new.published_revision_id and article_id = new.id
  )
begin
  select raise(abort, 'published revision belongs to another article');
end;

create trigger articles_published_revision_owner_update
before update of published_revision_id on articles
when new.published_revision_id is not null
  and not exists (
    select 1 from article_revisions
    where id = new.published_revision_id and article_id = new.id
  )
begin
  select raise(abort, 'published revision belongs to another article');
end;
