-- Security and cleanup repair (202609080001).
-- Existing databases: apply this migration only after confirming the guest schema exists.
-- No table reset or data rewrite. Historical migrations remain unchanged.
begin;

create or replace function public.merge_guest_into_account(p_guest_session_id uuid, p_user_id uuid, p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_tx uuid; v_status text; v_conflicts integer; v_moved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('guest-merge:'||p_guest_session_id::text,0));
  select id,status into v_tx,v_status from public.merge_transactions where guest_session_id=p_guest_session_id and user_id=p_user_id and idempotency_key=p_idempotency_key;
  if v_status='succeeded' then return v_tx; end if;
  -- Coordinate with cleanup before moving any owned rows.
  perform 1 from public.guest_sessions where id=p_guest_session_id and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'guest session not active'; end if;
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

create or replace function public.cleanup_expired_guest_sessions(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_ids uuid[]; v_count integer;
begin
  select coalesce(array_agg(id),array[]::uuid[]) into v_ids
  from (select g.id from public.guest_sessions g
    where (g.expires_at<=now() or g.revoked_at is not null)
      -- Retain tombstones referenced by merge audit records; ON DELETE RESTRICT is intentional.
      and not exists(select 1 from public.merge_transactions mt where mt.guest_session_id=g.id)
    order by g.expires_at asc limit greatest(1,least(coalesce(p_limit,500),5000)) for update of g skip locked) expired;
  delete from public.guest_sessions where id=any(v_ids); get diagnostics v_count=row_count;
  delete from public.recommendation_logs where anonymous_id in (select 'guest:' || guest_id::text from unnest(v_ids) as guest_id)
    and not exists(select 1 from public.menu_selections ms where ms.recommendation_id=recommendation_logs.id);
  return v_count;
end $$;

alter table public.app_users enable row level security;
revoke all on table public.app_users from public;
alter table public.app_user_sessions enable row level security;
revoke all on table public.app_user_sessions from public;
alter table public.ip_blocks enable row level security;
revoke all on table public.ip_blocks from public;
alter table public.anonymous_users enable row level security;
revoke all on table public.anonymous_users from public;
alter table public.pantry_items enable row level security;
revoke all on table public.pantry_items from public;
alter table public.recommendation_logs enable row level security;
revoke all on table public.recommendation_logs from public;
alter table public.savings_logs enable row level security;
revoke all on table public.savings_logs from public;
alter table public.guest_ownership_quarantine enable row level security;
revoke all on table public.guest_ownership_quarantine from public;
alter table public.guest_sessions enable row level security;
revoke all on table public.guest_sessions from public;
alter table public.user_shortcuts enable row level security;
revoke all on table public.user_shortcuts from public;
alter table public.menu_selections enable row level security;
revoke all on table public.menu_selections from public;
alter table public.merge_transactions enable row level security;
revoke all on table public.merge_transactions from public;
alter table public.merge_transaction_steps enable row level security;
revoke all on table public.merge_transaction_steps from public;

do $security$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on table public.app_users from %I',role_name);
      execute format('revoke all on table public.app_user_sessions from %I',role_name);
      execute format('revoke all on table public.ip_blocks from %I',role_name);
      execute format('revoke all on table public.anonymous_users from %I',role_name);
      execute format('revoke all on table public.pantry_items from %I',role_name);
      execute format('revoke all on table public.recommendation_logs from %I',role_name);
      execute format('revoke all on table public.savings_logs from %I',role_name);
      execute format('revoke all on table public.guest_ownership_quarantine from %I',role_name);
      execute format('revoke all on table public.guest_sessions from %I',role_name);
      execute format('revoke all on table public.user_shortcuts from %I',role_name);
      execute format('revoke all on table public.menu_selections from %I',role_name);
      execute format('revoke all on table public.merge_transactions from %I',role_name);
      execute format('revoke all on table public.merge_transaction_steps from %I',role_name);
      execute format('revoke all on function public.resolve_guest_session(text,text) from %I',role_name);
      execute format('revoke all on function public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb) from %I',role_name);
      execute format('revoke all on function public.record_menu_selection(uuid,uuid,uuid,text,text) from %I',role_name);
      execute format('revoke all on function public.get_realized_savings_total(uuid) from %I',role_name);
      execute format('revoke all on function public.merge_guest_into_account(uuid,uuid,text) from %I',role_name);
      execute format('revoke all on function public.get_merge_transaction(uuid) from %I',role_name);
      execute format('revoke all on function public.cleanup_expired_guest_sessions(integer) from %I',role_name);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select, insert, update, delete on table public.app_users to service_role;
    grant select, insert, update, delete on table public.app_user_sessions to service_role;
    grant select, insert, update, delete on table public.ip_blocks to service_role;
    grant select, insert, update, delete on table public.anonymous_users to service_role;
    grant select, insert, update, delete on table public.pantry_items to service_role;
    grant select, insert, update, delete on table public.recommendation_logs to service_role;
    grant select, insert, update, delete on table public.savings_logs to service_role;
    grant select, insert, update, delete on table public.guest_ownership_quarantine to service_role;
    grant select, insert, update, delete on table public.guest_sessions to service_role;
    grant select, insert, update, delete on table public.user_shortcuts to service_role;
    grant select, insert, update, delete on table public.menu_selections to service_role;
    grant select, insert, update, delete on table public.merge_transactions to service_role;
    grant select, insert, update, delete on table public.merge_transaction_steps to service_role;
    grant execute on function public.resolve_guest_session(text,text) to service_role;
    grant execute on function public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
    grant execute on function public.record_menu_selection(uuid,uuid,uuid,text,text) to service_role;
    grant execute on function public.get_realized_savings_total(uuid) to service_role;
    grant execute on function public.merge_guest_into_account(uuid,uuid,text) to service_role;
    grant execute on function public.get_merge_transaction(uuid) to service_role;
    grant execute on function public.cleanup_expired_guest_sessions(integer) to service_role;
  end if;
end $security$;

revoke all on function public.resolve_guest_session(text,text) from public;
alter function public.resolve_guest_session(text,text) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb) from public;
alter function public.record_recommendation_exposure(uuid,uuid,jsonb,jsonb,jsonb) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.record_menu_selection(uuid,uuid,uuid,text,text) from public;
alter function public.record_menu_selection(uuid,uuid,uuid,text,text) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.get_realized_savings_total(uuid) from public;
alter function public.get_realized_savings_total(uuid) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.merge_guest_into_account(uuid,uuid,text) from public;
alter function public.merge_guest_into_account(uuid,uuid,text) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.get_merge_transaction(uuid) from public;
alter function public.get_merge_transaction(uuid) set search_path = pg_catalog, public, pg_temp;
revoke all on function public.cleanup_expired_guest_sessions(integer) from public;
alter function public.cleanup_expired_guest_sessions(integer) set search_path = pg_catalog, public, pg_temp;

notify pgrst, 'reload schema';
commit;
