create table if not exists public.anonymous_users (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  name text not null,
  quantity text,
  expires_at date,
  created_at timestamptz not null default now()
);

create index if not exists pantry_items_anonymous_id_idx
  on public.pantry_items (anonymous_id);

create table if not exists public.recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  input_ingredients jsonb not null,
  preferences jsonb,
  ai_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_logs_anonymous_id_created_at_idx
  on public.recommendation_logs (anonymous_id, created_at desc);

create table if not exists public.savings_logs (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  recipe_name text not null,
  estimated_savings integer not null,
  created_at timestamptz not null default now()
);

create index if not exists savings_logs_anonymous_id_created_at_idx
  on public.savings_logs (anonymous_id, created_at desc);

