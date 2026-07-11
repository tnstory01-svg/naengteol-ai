-- Ordered additive migration for guest selection and account merge.
-- Legacy savings rows remain legacy_exposure; this migration never realizes exposure.
-- Rollback is intentionally non-destructive: ownership merges require audited restore;
-- do not author a destructive down migration.
begin;
-- Additive guest selection/merge contract. Existing legacy logs remain immutable in meaning:
-- recommendation_logs and savings_logs rows predating menu selections are exposure/legacy
-- records; no migration converts them into realized savings. Rollback is intentionally
-- non-destructive: remove functions only after dependent application code is retired.
create table if not exists public.guest_ownership_quarantine (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  row_data jsonb not null,
  reason text not null,
  quarantined_at timestamptz not null default now()
);
create index if not exists guest_ownership_quarantine_source_idx
  on public.guest_ownership_quarantine(source_table, quarantined_at desc);
create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  csrf_token text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists guest_sessions_expires_at_idx
  on public.guest_sessions (expires_at);
create index if not exists guest_sessions_last_seen_at_idx
  on public.guest_sessions (last_seen_at desc);

-- Pantry ownership is upgraded before validation. Ambiguous legacy rows are preserved
-- verbatim in quarantine and removed from the live owned-row surface.
alter table public.pantry_items add column if not exists guest_session_id uuid references public.guest_sessions(id) on delete cascade;
alter table public.pantry_items add column if not exists stable_id text;
update public.pantry_items set stable_id=id::text where stable_id is null;
create unique index if not exists guest_ownership_quarantine_reason_uidx
  on public.guest_ownership_quarantine(source_table,source_id,reason);
insert into public.guest_ownership_quarantine(source_table,source_id,row_data,reason)
select 'pantry_items',id,to_jsonb(p),case when user_id is null and guest_session_id is null then 'orphan_owner' else 'dual_owner' end
from public.pantry_items p
where (user_id is null) = (guest_session_id is null)
on conflict (source_table,source_id,reason) do nothing;
delete from public.pantry_items where (user_id is null) = (guest_session_id is null);
alter table public.pantry_items alter column stable_id set not null;
alter table public.pantry_items drop constraint if exists pantry_items_owner_xor_ck;
alter table public.pantry_items add constraint pantry_items_owner_xor_ck
  check ((user_id is not null) <> (guest_session_id is not null)) not valid;
alter table public.pantry_items validate constraint pantry_items_owner_xor_ck;
create unique index if not exists pantry_items_user_stable_uidx
  on public.pantry_items(user_id,stable_id) where user_id is not null;
create unique index if not exists pantry_items_guest_stable_uidx
  on public.pantry_items(guest_session_id,stable_id) where guest_session_id is not null;
create index if not exists pantry_items_guest_expiry_idx
  on public.pantry_items(guest_session_id,expires_at asc) where guest_session_id is not null;

create table if not exists public.user_shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  shortcut_id text not null,
  shortcut_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_shortcuts_owner_xor_ck
    check ((user_id is not null) <> (guest_session_id is not null))
);
create unique index if not exists user_shortcuts_user_stable_uidx
  on public.user_shortcuts(user_id, shortcut_id) where user_id is not null;
create unique index if not exists user_shortcuts_guest_stable_uidx
  on public.user_shortcuts(guest_session_id, shortcut_id) where guest_session_id is not null;

create table if not exists public.menu_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  recommendation_id uuid not null references public.recommendation_logs(id) on delete restrict,
  recipe_id text not null,
  idempotency_key text not null,
  recipe_snapshot jsonb not null,
  estimated_savings integer not null default 0 check (estimated_savings >= 0),
  selected_at timestamptz not null default now(),
  constraint menu_selections_owner_xor_ck
    check ((user_id is not null) <> (guest_session_id is not null))
);
create unique index if not exists menu_selections_user_idempotency_uidx
  on public.menu_selections(user_id, idempotency_key) where user_id is not null;
create unique index if not exists menu_selections_guest_idempotency_uidx
  on public.menu_selections(guest_session_id, idempotency_key) where guest_session_id is not null;
create unique index if not exists menu_selections_user_recommendation_uidx
  on public.menu_selections(user_id, recommendation_id) where user_id is not null;
create unique index if not exists menu_selections_guest_recommendation_uidx
  on public.menu_selections(guest_session_id, recommendation_id) where guest_session_id is not null;
create index if not exists menu_selections_selected_at_idx
  on public.menu_selections(selected_at desc);

create table if not exists public.merge_transactions (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid not null references public.guest_sessions(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','partial','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error jsonb
);
create unique index if not exists merge_transactions_guest_user_key_uidx
  on public.merge_transactions(guest_session_id, user_id, idempotency_key);
create index if not exists merge_transactions_user_created_idx
  on public.merge_transactions(user_id, created_at desc);

create table if not exists public.merge_transaction_steps (
  id uuid primary key default gen_random_uuid(),
  merge_transaction_id uuid not null references public.merge_transactions(id) on delete cascade,
  category text not null check (category in ('shortcuts','menu_selections','pantry_items','recommendation_logs','savings_logs')),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  added_count integer not null default 0,
  account_kept_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  error jsonb,
  unique (merge_transaction_id, category)
);
create index if not exists merge_transaction_steps_retry_idx
  on public.merge_transaction_steps(merge_transaction_id, status);

alter table public.savings_logs
  add column if not exists savings_classification text not null default 'legacy_exposure';
alter table public.savings_logs
  drop constraint if exists savings_logs_savings_classification_ck;
alter table public.savings_logs
  add constraint savings_logs_savings_classification_ck
  check (savings_classification in ('legacy_exposure','realized_selection'));

alter table public.guest_sessions enable row level security;
alter table public.user_shortcuts enable row level security;
alter table public.menu_selections enable row level security;
alter table public.merge_transactions enable row level security;
alter table public.merge_transaction_steps enable row level security;

create or replace function public.resolve_guest_session(p_token_hash text, p_csrf_token text)
returns table (guest_session_id uuid, expires_at timestamptz, csrf_token text)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select id, expires_at, csrf_token
    from public.guest_sessions
   where token_hash = p_token_hash and csrf_token = p_csrf_token
     and revoked_at is null and expires_at > now()
$$;

create or replace function public.record_recommendation_exposure(
  p_guest_session_id uuid, p_recommendation_id uuid, p_input_ingredients jsonb, p_preferences jsonb, p_ai_response jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if not exists (select 1 from public.guest_sessions where id=p_guest_session_id and revoked_at is null and expires_at>now()) then
    raise exception 'guest session not active';
  end if;
  insert into public.recommendation_logs(id,anonymous_id,input_ingredients,preferences,ai_response)
  values (p_recommendation_id,'guest:' || p_guest_session_id::text,p_input_ingredients,p_preferences,p_ai_response);
  delete from public.recommendation_logs old
   where old.id in (select rl.id from public.recommendation_logs rl
     where rl.anonymous_id='guest:' || p_guest_session_id::text
       and not exists(select 1 from public.menu_selections ms where ms.recommendation_id=rl.id)
     order by rl.created_at desc offset 200);
  return p_recommendation_id;
end $$;

create or replace function public.record_menu_selection(
  p_owner_user_id uuid, p_guest_session_id uuid, p_recommendation_id uuid, p_recipe_id text, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_row public.menu_selections; v_recipe jsonb;
begin
  if (p_owner_user_id is null) = (p_guest_session_id is null) then raise exception 'exactly one owner is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_owner_user_id::text,'guest:'||p_guest_session_id::text)||':'||p_recommendation_id::text,0));
  select * into v_row from public.menu_selections where idempotency_key=p_idempotency_key
    and ((p_owner_user_id is not null and user_id=p_owner_user_id) or (p_guest_session_id is not null and guest_session_id=p_guest_session_id));
  if v_row.id is not null then return jsonb_build_object('outcome','replayed','selection',to_jsonb(v_row)); end if;
  select * into v_row from public.menu_selections where recommendation_id=p_recommendation_id
    and ((p_owner_user_id is not null and user_id=p_owner_user_id) or (p_guest_session_id is not null and guest_session_id=p_guest_session_id));
  if v_row.id is not null then return jsonb_build_object('outcome','conflict','selection',to_jsonb(v_row)); end if;
  select recipe into v_recipe from public.recommendation_logs rl
    cross join lateral jsonb_array_elements(rl.ai_response->'recipes') recipe
   where rl.id=p_recommendation_id and coalesce(recipe->>'id',recipe->>'recipeId')=p_recipe_id
     and ((p_owner_user_id is not null and rl.user_id=p_owner_user_id) or (p_guest_session_id is not null and rl.anonymous_id='guest:'||p_guest_session_id::text));
  if v_recipe is null then raise exception 'owned recommendation recipe not found'; end if;
  insert into public.menu_selections(user_id,guest_session_id,recommendation_id,recipe_id,idempotency_key,recipe_snapshot,estimated_savings)
  values (p_owner_user_id,p_guest_session_id,p_recommendation_id,p_recipe_id,p_idempotency_key,v_recipe,coalesce((v_recipe->>'estimatedSavings')::integer,0)) returning * into v_row;
  return jsonb_build_object('outcome','created','selection',to_jsonb(v_row));
end $$;

create or replace function public.get_realized_savings_total(p_user_id uuid)
returns bigint
language sql stable security definer set search_path = public, pg_catalog
as $$ select coalesce(sum(estimated_savings),0)::bigint from public.menu_selections where user_id=p_user_id $$;

create or replace function public.merge_guest_into_account(p_guest_session_id uuid, p_user_id uuid, p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_tx uuid; v_status text; v_conflicts integer; v_moved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(least(p_guest_session_id::text,p_user_id::text)||':'||greatest(p_guest_session_id::text,p_user_id::text),0));
  select id,status into v_tx,v_status from public.merge_transactions where guest_session_id=p_guest_session_id and user_id=p_user_id and idempotency_key=p_idempotency_key;
  if v_status='succeeded' then return v_tx; end if;
  if not exists(select 1 from public.guest_sessions where id=p_guest_session_id and revoked_at is null and expires_at>now()) then raise exception 'guest session not active'; end if;
  insert into public.merge_transactions(guest_session_id,user_id,idempotency_key,status) values (p_guest_session_id,p_user_id,p_idempotency_key,'running')
  on conflict (guest_session_id,user_id,idempotency_key) do update set status='running',error=null returning id into v_tx;
  insert into public.merge_transaction_steps(merge_transaction_id,category) values (v_tx,'shortcuts'),(v_tx,'menu_selections'),(v_tx,'pantry_items') on conflict do nothing;
  if exists(select 1 from public.merge_transaction_steps where merge_transaction_id=v_tx and category='shortcuts' and status<>'succeeded') then
    begin
      select count(*) into v_conflicts from public.user_shortcuts g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.user_shortcuts a where a.user_id=p_user_id and a.shortcut_id=g.shortcut_id);
      delete from public.user_shortcuts g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.user_shortcuts a where a.user_id=p_user_id and a.shortcut_id=g.shortcut_id);
      update public.user_shortcuts set user_id=p_user_id,guest_session_id=null,updated_at=now() where guest_session_id=p_guest_session_id; get diagnostics v_moved=row_count;
      update public.merge_transaction_steps set status='succeeded',attempts=attempts+1,added_count=v_moved,account_kept_count=v_conflicts,failed_count=0,completed_at=now(),error=null,error_code=null where merge_transaction_id=v_tx and category='shortcuts';
    exception when others then update public.merge_transaction_steps set status='failed',attempts=attempts+1,failed_count=1,error_code=sqlstate,error=jsonb_build_object('message',sqlerrm) where merge_transaction_id=v_tx and category='shortcuts'; end;
  end if;
  if exists(select 1 from public.merge_transaction_steps where merge_transaction_id=v_tx and category='menu_selections' and status<>'succeeded') then
    begin
      select count(*) into v_conflicts from public.menu_selections g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.menu_selections a where a.user_id=p_user_id and (a.recommendation_id=g.recommendation_id or a.idempotency_key=g.idempotency_key));
      delete from public.menu_selections g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.menu_selections a where a.user_id=p_user_id and (a.recommendation_id=g.recommendation_id or a.idempotency_key=g.idempotency_key));
      update public.menu_selections set user_id=p_user_id,guest_session_id=null where guest_session_id=p_guest_session_id; get diagnostics v_moved=row_count;
      update public.merge_transaction_steps set status='succeeded',attempts=attempts+1,added_count=v_moved,account_kept_count=v_conflicts,failed_count=0,completed_at=now(),error=null,error_code=null where merge_transaction_id=v_tx and category='menu_selections';
    exception when others then update public.merge_transaction_steps set status='failed',attempts=attempts+1,failed_count=1,error_code=sqlstate,error=jsonb_build_object('message',sqlerrm) where merge_transaction_id=v_tx and category='menu_selections'; end;
  end if;
  if exists(select 1 from public.merge_transaction_steps where merge_transaction_id=v_tx and category='pantry_items' and status<>'succeeded') then
    begin
      select count(*) into v_conflicts from public.pantry_items g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.pantry_items a where a.user_id=p_user_id and a.stable_id=g.stable_id);
      delete from public.pantry_items g where g.guest_session_id=p_guest_session_id and exists(select 1 from public.pantry_items a where a.user_id=p_user_id and a.stable_id=g.stable_id);
      update public.pantry_items set user_id=p_user_id,guest_session_id=null,updated_at=now() where guest_session_id=p_guest_session_id; get diagnostics v_moved=row_count;
      update public.merge_transaction_steps set status='succeeded',attempts=attempts+1,added_count=v_moved,account_kept_count=v_conflicts,failed_count=0,completed_at=now(),error=null,error_code=null where merge_transaction_id=v_tx and category='pantry_items';
    exception when others then update public.merge_transaction_steps set status='failed',attempts=attempts+1,failed_count=1,error_code=sqlstate,error=jsonb_build_object('message',sqlerrm) where merge_transaction_id=v_tx and category='pantry_items'; end;
  end if;
  if exists(select 1 from public.merge_transaction_steps where merge_transaction_id=v_tx and status='failed') then update public.merge_transactions set status='partial' where id=v_tx;
  else update public.merge_transactions set status='succeeded',completed_at=now() where id=v_tx; update public.guest_sessions set revoked_at=now() where id=p_guest_session_id; end if;
  return v_tx;
end $$;

create or replace function public.get_merge_transaction(p_id uuid)
returns setof public.merge_transactions
language sql stable security definer set search_path = public, pg_catalog
as $$ select * from public.merge_transactions where id=p_id $$;

create or replace function public.cleanup_expired_guest_sessions(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_ids uuid[]; v_count integer;
begin
  select coalesce(array_agg(id),array[]::uuid[]) into v_ids
  from (select id from public.guest_sessions where expires_at<=now() or revoked_at is not null order by expires_at asc limit greatest(1,least(p_limit,5000))) expired;
  delete from public.guest_sessions where id=any(v_ids); get diagnostics v_count=row_count;
  delete from public.recommendation_logs where anonymous_id in (select 'guest:' || guest_id::text from unnest(v_ids) as guest_id)
    and not exists(select 1 from public.menu_selections ms where ms.recommendation_id=recommendation_logs.id);
  return v_count;
end $$;

revoke all on function public.resolve_guest_session(text,text) from public;
revoke all on function public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb) from public;
revoke all on function public.record_menu_selection(uuid,uuid,uuid,text,text) from public;
revoke all on function public.get_realized_savings_total(uuid) from public;
revoke all on function public.merge_guest_into_account(uuid,uuid,text) from public;
revoke all on function public.get_merge_transaction(uuid) from public;
revoke all on function public.cleanup_expired_guest_sessions(integer) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.resolve_guest_session(text,text), public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb), public.record_menu_selection(uuid,uuid,uuid,text,text), public.get_realized_savings_total(uuid), public.merge_guest_into_account(uuid,uuid,text), public.get_merge_transaction(uuid), public.cleanup_expired_guest_sessions(integer) to service_role;
  end if;
end $$;

commit;
