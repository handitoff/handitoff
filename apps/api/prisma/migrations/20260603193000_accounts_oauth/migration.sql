create table account_users (
  id text primary key,
  email text not null unique,
  name text not null,
  avatar_url text,
  handle text unique,
  default_device_name text,
  plan text not null default 'account',
  provider text not null default 'google',
  provider_subject text not null unique,
  receive_mode boolean not null default false,
  require_sender_name boolean not null default true,
  allow_sender_message boolean not null default true,
  require_sender_message boolean not null default false,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now()
);

create index account_users_handle_idx on account_users(handle);

create table account_sessions (
  id text primary key,
  user_id text not null references account_users(id) on delete cascade,
  expires_at timestamptz(6) not null,
  created_at timestamptz(6) not null default now()
);

create index account_sessions_user_id_idx on account_sessions(user_id);
create index account_sessions_expires_at_idx on account_sessions(expires_at);
