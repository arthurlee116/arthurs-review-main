pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists articles (
  id integer primary key autoincrement,
  title_zh text not null,
  title_en text,
  slug text not null,
  category text not null check (category in ('commentary', 'society', 'misc')),
  status text not null check (status in ('draft', 'published')) default 'draft',
  published_at text,
  updated_at text not null,
  excerpt_zh text not null default '',
  excerpt_en text,
  cover_image_path text,
  is_featured integer not null default 0 check (is_featured in (0, 1)),
  seo_description text not null default '',
  body_zh_path text not null,
  body_en_path text,
  unique(category, slug)
);

create index if not exists articles_status_published_idx on articles(status, published_at desc, id desc);
create index if not exists articles_category_status_idx on articles(category, status, published_at desc, id desc);

create table if not exists tags (
  id integer primary key autoincrement,
  name text not null unique,
  slug text not null unique,
  created_at text not null
);

create table if not exists article_tags (
  article_id integer not null references articles(id) on delete cascade,
  tag_id integer not null references tags(id) on delete cascade,
  primary key(article_id, tag_id)
);

create table if not exists settings (
  key text primary key,
  value text not null
);

create virtual table if not exists article_search using fts5(
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
