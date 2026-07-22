drop index jobs_claim_idx;
drop index jobs_stale_lock_idx;

alter table jobs rename to jobs_before_semantic_search;

create table jobs (
  id integer primary key autoincrement,
  type text not null check (type in (
    'proof.create',
    'proof.ots_upgrade_verify',
    'proof.wayback_capture',
    'cache.invalidate',
    'translation.article',
    'search.embed'
  )),
  payload text not null check (json_valid(payload)),
  dedupe_key text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'dead')) default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  run_at text not null,
  locked_at text,
  locked_by text,
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique(type, dedupe_key)
);

insert into jobs(
  id, type, payload, dedupe_key, status, attempts, max_attempts,
  run_at, locked_at, locked_by, last_error, created_at, updated_at
)
select
  id, type, payload, dedupe_key, status, attempts, max_attempts,
  run_at, locked_at, locked_by, last_error, created_at, updated_at
from jobs_before_semantic_search;

drop table jobs_before_semantic_search;

create index jobs_claim_idx on jobs(status, run_at, id);
create index jobs_stale_lock_idx on jobs(status, locked_at);

create table article_embedding_chunks (
  id integer primary key autoincrement,
  article_id integer not null references articles(id) on delete cascade,
  revision_id integer not null references article_revisions(id) on delete cascade,
  model_id text not null check (length(model_id) > 0),
  model_revision text not null check (length(model_revision) > 0),
  dimension integer not null check (dimension > 0),
  chunk_index integer not null check (chunk_index >= 0),
  language text not null check (language in ('metadata', 'zh', 'en')),
  content text not null check (length(content) > 0),
  token_count integer not null check (token_count >= 0),
  embedding blob not null check (
    typeof(embedding) = 'blob'
    and length(embedding) = dimension * 4
  ),
  created_at text not null,
  unique(article_id, revision_id, model_id, model_revision, chunk_index)
);

create index article_embedding_chunks_model_article_idx
on article_embedding_chunks(model_id, model_revision, article_id);

create index article_embedding_chunks_article_revision_idx
on article_embedding_chunks(article_id, revision_id);
