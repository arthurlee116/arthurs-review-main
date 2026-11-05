-- Reader comments. Every comment starts as 'pending' and is only shown publicly
-- after manual approval in Studio. No IP address or user agent is stored.
create table comments (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  author_name text,
  email text,
  body text not null,
  locale text not null check (locale in ('zh', 'en')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at text not null,
  reviewed_at text
);

create index comments_status_idx on comments(status, created_at);
create index comments_article_public_idx on comments(article_id, created_at) where status = 'approved';
