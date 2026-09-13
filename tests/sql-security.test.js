import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const repair = await readFile(new URL('../supabase/migrations/202609080001_security_cleanup.sql', import.meta.url), 'utf8');
const baseline = schema.split('-- Security and cleanup repair (202609080001).')[0];
// PGlite has built-in gen_random_uuid; pgcrypto installation is deployment-specific.
const executable = (sql) => sql.replace('create extension if not exists pgcrypto;', '');

test('PostgreSQL reproduces old privilege/cleanup defects, then preserves data with the repair', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
    await db.exec(executable(baseline));
    await db.exec(`insert into public.app_users(id,email,display_name,password_hash) values
      ('00000000-0000-4000-8000-000000000001','sql-test@example.invalid','Test','test-only');
      insert into public.guest_ownership_quarantine(source_table,source_id,row_data,reason)
      values('pantry_items',gen_random_uuid(),'{"private":"must survive"}','orphan_owner');
      insert into public.guest_sessions(id,token_hash,csrf_token,expires_at) values
      ('00000000-0000-4000-8000-000000000002','expired-merge','csrf',now()-interval '1 day'),
      ('00000000-0000-4000-8000-000000000003','expired-unlinked','csrf',now()-interval '1 day'),
      ('00000000-0000-4000-8000-000000000004','active','csrf',now()+interval '1 day');
      insert into public.merge_transactions(guest_session_id,user_id,idempotency_key,status)
      values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','old-merge','succeeded');
      set role anon;`);
    assert.equal((await db.query('select * from public.guest_ownership_quarantine')).rows.length, 1);
    await db.exec('reset role');
    assert.equal((await db.query("select has_function_privilege('anon','public.merge_guest_into_account(uuid,uuid,text)','EXECUTE') as allowed")).rows[0].allowed, true);
    await assert.rejects(db.query('select public.cleanup_expired_guest_sessions(500)'), (error) => ['23503','23001'].includes(error.code));

    await db.exec(repair);
    await db.exec(repair); // Safe replay changes privileges/functions, not records.
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.guest_ownership_quarantine'), (error) => error.code === '42501');
      await assert.rejects(db.query("select public.get_realized_savings_total('00000000-0000-4000-8000-000000000001')"), (error) => error.code === '42501');
      await db.exec('reset role');
      const privileges = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))`, [role]);
      assert.deepEqual(privileges.rows, []);
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select * from public.guest_ownership_quarantine')).rows.length, 1);
    assert.equal((await db.query('select public.cleanup_expired_guest_sessions(500) as count')).rows[0].count, 1);
    assert.equal((await db.query('select * from public.merge_transactions')).rows.length, 1);
    assert.equal((await db.query('select * from public.guest_sessions')).rows.length, 2);
    await db.exec(`insert into public.pantry_items(user_id,name,stable_id) values('00000000-0000-4000-8000-000000000001','egg','account');
      insert into public.pantry_items(guest_session_id,name,stable_id) values('00000000-0000-4000-8000-000000000004','rice','guest');`);
    const args = ['00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','merge-test'];
    const first = await db.query('select public.merge_guest_into_account($1,$2,$3) as id', args);
    const replay = await db.query('select public.merge_guest_into_account($1,$2,$3) as id', args);
    assert.deepEqual(first.rows, replay.rows);
    assert.equal((await db.query("select * from public.pantry_items where user_id='00000000-0000-4000-8000-000000000001'")).rows.length, 2);
    assert.equal((await db.query('select public.cleanup_expired_guest_sessions(500) as count')).rows[0].count, 0);
    assert.equal((await db.query('select * from public.merge_transactions')).rows.length, 2);
  } finally { await db.close(); }
});

test('fresh bootstrap contains the exact follow-up repair', () => {
  assert.equal(schema.slice(schema.indexOf('-- Security and cleanup repair (202609080001).')), repair);
});
