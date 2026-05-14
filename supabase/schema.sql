create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_email_unique_idx
  on public.app_users (lower(email));

create table if not exists public.app_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  token_hash text not null unique,
  csrf_token text not null,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists app_user_sessions_user_id_expires_at_idx
  on public.app_user_sessions (user_id, expires_at desc);

create table if not exists public.anonymous_users (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete cascade,
  anonymous_id text,
  name text not null,
  quantity text,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pantry_items_user_id_expires_at_idx
  on public.pantry_items (user_id, expires_at asc);

create index if not exists pantry_items_anonymous_id_idx
  on public.pantry_items (anonymous_id);

create table if not exists public.recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete set null,
  anonymous_id text not null,
  input_ingredients jsonb not null,
  preferences jsonb,
  ai_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_logs_user_id_created_at_idx
  on public.recommendation_logs (user_id, created_at desc);

create index if not exists recommendation_logs_anonymous_id_created_at_idx
  on public.recommendation_logs (anonymous_id, created_at desc);

create table if not exists public.savings_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete set null,
  anonymous_id text not null,
  recipe_name text not null,
  estimated_savings integer not null check (estimated_savings >= 0),
  created_at timestamptz not null default now()
);

create index if not exists savings_logs_user_id_created_at_idx
  on public.savings_logs (user_id, created_at desc);

create index if not exists savings_logs_anonymous_id_created_at_idx
  on public.savings_logs (anonymous_id, created_at desc);

alter table public.app_users enable row level security;
alter table public.app_user_sessions enable row level security;
alter table public.anonymous_users enable row level security;
alter table public.pantry_items enable row level security;
alter table public.recommendation_logs enable row level security;
alter table public.savings_logs enable row level security;

-- The app server uses SUPABASE_SERVICE_ROLE_KEY for server-side writes.
-- Do not add broad anon/authenticated policies unless browser-side Supabase access is intentionally introduced.
