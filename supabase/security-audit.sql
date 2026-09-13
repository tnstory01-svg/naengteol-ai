-- Read-only preflight for the application schema. No user rows or credentials are returned.
begin read only;

select current_database() as database_name, current_user as inspected_as, version() as postgres_version;

with expected(name) as (values
 ('app_users'),('app_user_sessions'),('ip_blocks'),('anonymous_users'),('pantry_items'),
 ('recommendation_logs'),('savings_logs'),('guest_sessions'),('guest_ownership_quarantine'),
 ('user_shortcuts'),('menu_selections'),('merge_transactions'),('merge_transaction_steps'))
select e.name, c.oid is not null as present, c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_access,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_access,
 has_table_privilege('service_role',c.oid,'SELECT') as server_read
from expected e left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.name and c.relkind='r'
order by e.name;

select p.oid::regprocedure::text as signature, p.prosecdef as security_definer, p.proconfig as settings,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('resolve_guest_session','record_recommendation_exposure',
 'record_menu_selection','get_realized_savings_total','merge_guest_into_account','get_merge_transaction','cleanup_expired_guest_sessions')
order by signature;

select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' order by tablename,policyname;

select c.conname,c.conrelid::regclass::text as source_table,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.contype='f' and c.confrelid=to_regclass('public.guest_sessions')
order by source_table,c.conname;

select to_regclass('supabase_migrations.schema_migrations') is not null as migration_history_available;
commit;
