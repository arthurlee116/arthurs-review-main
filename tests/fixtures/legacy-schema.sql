pragma foreign_keys = on;

create table articles (
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

create index articles_status_published_idx on articles(status, published_at desc, id desc);
create index articles_category_status_idx on articles(category, status, published_at desc, id desc);

create table publication_proofs (
  id integer primary key autoincrement,
  article_id integer not null,
  created_at text not null,
  public_url text not null,
  content_fingerprint text not null,
  document_sha256 text not null,
  document_path text not null,
  ots_path text,
  ots_status text not null check (ots_status in ('pending', 'complete', 'failed')),
  ots_error text,
  wayback_url text,
  wayback_status text not null check (wayback_status in ('pending', 'complete', 'failed')),
  wayback_error text,
  unique(article_id, content_fingerprint)
);

create index publication_proofs_article_idx on publication_proofs(article_id, created_at desc, id desc);

create table tags (
  id integer primary key autoincrement,
  name text not null unique,
  slug text not null unique,
  created_at text not null
);

create table article_tags (
  article_id integer not null references articles(id) on delete cascade,
  tag_id integer not null references tags(id) on delete cascade,
  primary key(article_id, tag_id)
);

create table settings (
  key text primary key,
  value text not null
);

create virtual table article_search using fts5(
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
