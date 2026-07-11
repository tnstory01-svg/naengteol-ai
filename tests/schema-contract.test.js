import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202607110001_guest_selection_merge.sql", import.meta.url), "utf8");

for (const [name, sql] of [["bootstrap", schema], ["migration", migration]]) {
  test(`${name} defines owned guest and realized-selection entities`, () => {
    for (const table of ["guest_sessions", "user_shortcuts", "menu_selections", "merge_transactions", "merge_transaction_steps"]) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    }
    assert.match(sql, /legacy_exposure/);
    assert.match(sql, /menu_selections_owner_xor_ck/);
    assert.match(sql, /pantry_items_owner_xor_ck/);
    assert.match(sql, /guest_ownership_quarantine[\s\S]*insert into public\.guest_ownership_quarantine/i);
    assert.match(sql, /delete from public\.pantry_items where \(user_id is null\) = \(guest_session_id is null\)/i);
    assert.match(sql, /pantry_items_guest_stable_uidx/);
    assert.match(sql, /guest_sessions_expires_at_idx/);
  });

  test(`${name} locks down transactional RPC contracts`, () => {
    assert.match(sql, /security definer set search_path = public, pg_catalog/i);
    assert.match(sql, /record_menu_selection[\s\S]*p_recipe_id text/i);
    assert.match(sql, /merge_guest_into_account[\s\S]*p_idempotency_key text/i);
    assert.match(sql, /merge_guest_into_account[\s\S]*update public\.pantry_items set user_id=p_user_id,guest_session_id=null/i);
    assert.match(sql, /cleanup_expired_guest_sessions/i);
    assert.match(sql, /record_menu_selection[\s\S]*returns jsonb/i);
    assert.match(sql, /pg_advisory_xact_lock/);
    for (const category of ["shortcuts", "menu_selections", "pantry_items"]) assert.match(sql, new RegExp(`category='${category}' and status<>'succeeded'`));
    assert.match(sql, /a\.recommendation_id=g\.recommendation_id or a\.idempotency_key=g\.idempotency_key/);
    assert.match(sql, /revoke all on function public\.record_menu_selection/i);
    assert.match(sql, /grant execute on function[\s\S]*public\.merge_guest_into_account/i);
  });
}
