drop index if exists publication_proofs_article_idx;
alter table publication_proofs rename to publication_proofs_legacy;

create table publication_proofs (
  id integer primary key autoincrement,
  article_id integer not null,
  created_at text not null,
  public_url text not null,
  content_fingerprint text not null,
  document_sha256 text not null,
  document_path text not null,
  ots_path text,
  ots_status text not null check (ots_status in ('submitted', 'pending_confirmation', 'anchored', 'verification_failed')),
  ots_error text,
  wayback_url text,
  wayback_status text not null check (wayback_status in ('pending', 'complete', 'failed')),
  wayback_error text,
  unique(article_id, content_fingerprint)
);

insert into publication_proofs(
  id, article_id, created_at, public_url, content_fingerprint, document_sha256, document_path,
  ots_path, ots_status, ots_error, wayback_url, wayback_status, wayback_error
)
select
  id, article_id, created_at, public_url, content_fingerprint, document_sha256, document_path,
  ots_path,
  case
    when ots_status = 'failed' then 'verification_failed'
    when ots_path is not null then 'pending_confirmation'
    else 'submitted'
  end,
  ots_error, wayback_url, wayback_status, wayback_error
from publication_proofs_legacy;

drop table publication_proofs_legacy;
create index publication_proofs_article_idx on publication_proofs(article_id, created_at desc, id desc);
