create table jobs (
  id integer primary key autoincrement,
  type text not null check (type in (
    'proof.create',
    'proof.ots_upgrade_verify',
    'proof.wayback_capture',
    'cache.invalidate',
    'translation.article'
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

create index jobs_claim_idx on jobs(status, run_at, id);
create index jobs_stale_lock_idx on jobs(status, locked_at);

alter table publication_proofs
add column article_revision_id integer references article_revisions(id) on delete set null;

update publication_proofs
set article_revision_id = (
  select coalesce(articles.published_revision_id, articles.draft_revision_id)
  from articles
  where articles.id = publication_proofs.article_id
);

create index publication_proofs_revision_idx on publication_proofs(article_revision_id, id desc);
