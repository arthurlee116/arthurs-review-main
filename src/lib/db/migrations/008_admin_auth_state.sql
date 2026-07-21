create table admin_sessions (
  id integer primary key autoincrement,
  token_hash text not null unique,
  created_at text not null,
  expires_at text not null,
  revoked_at text
);

create index admin_sessions_active_idx on admin_sessions(token_hash, expires_at) where revoked_at is null;

create table login_attempts (
  id integer primary key autoincrement,
  ip_hash text not null,
  attempted_at text not null
);

create index login_attempts_window_idx on login_attempts(ip_hash, attempted_at);
