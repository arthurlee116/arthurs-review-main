create table translation_batches (
  id text primary key,
  model text not null,
  total_count integer not null check (total_count >= 0),
  created_at text not null
);

create index jobs_translation_batch_idx
on jobs(type, json_extract(payload, '$.batchId'), status)
where type = 'translation.article';
