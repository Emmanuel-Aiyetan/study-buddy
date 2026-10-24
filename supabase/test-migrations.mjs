import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  grant usage on schema public, auth, storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`);
for (let i = 0; i < 2; i++) {
  for (const file of ['001_baseline.sql', '002_adaptive_security.sql']) {
    await db.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  }
}
const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
const plan = '10000000-0000-0000-0000-000000000001';
const task = '20000000-0000-0000-0000-000000000001';
await db.query(`insert into auth.users(id) values($1),($2)`, [userA, userB]);
await db.query(`insert into public.study_plans(id,user_id,title,goal,deadline,study_time) values($1,$2,'Plan','Learn',current_date+7,1)`, [plan,userA]);
await db.query(`insert into public.study_tasks(id,study_plan_id,title,scheduled_date,estimated_minutes) values($1,$2,'Practice',current_date-1,30)`, [task,plan]);
// A pre-existing broad policy must not bypass the new restrictive guard.
await db.exec(`create policy old_broad_access on public.study_tasks for all to authenticated using(true) with check(true)`);
await db.exec(`set role authenticated`);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [userB]);
assert.equal((await db.query(`select * from public.study_tasks`)).rows.length, 0);
await assert.rejects(db.query(`insert into public.study_tasks(study_plan_id,title) values($1,'Intrusion')`, [plan]));
await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('study-materials',$1)`, [`${userA}/x.pdf`]));
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [userA]);
assert.equal((await db.query(`select * from public.study_tasks`)).rows.length, 1);
const { rows: [{ today, deadline }] } = await db.query(`select current_date::text today, (current_date+7)::text deadline`);
async function snapshot() {
  return (await db.query(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'scheduled_date',scheduled_date,'completed',completed,'estimated_minutes',estimated_minutes) order by id),'[]') as data from public.study_tasks where study_plan_id=$1`, [plan])).rows[0].data;
}
const expected = await snapshot();
const apply = (schedule, state=expected, hours=1) => db.query(`select public.adapt_study_plan($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [plan, deadline, hours, today, JSON.stringify(state), JSON.stringify(schedule)]);
await assert.rejects(apply([{ id:task, scheduled_date:'2000-01-01' }]));
await assert.rejects(apply([{ id:task, scheduled_date:today }], expected, .25));
await assert.rejects(apply([{ id:task, scheduled_date:today }, { id:task, scheduled_date:today }]));
await assert.rejects(apply(null));
await apply([{ id:task, scheduled_date:today }]);
assert.equal((await db.query(`select scheduled_date::text as scheduled from public.study_tasks where id=$1`, [task])).rows[0].scheduled, today);
await assert.rejects(apply([{ id:task, scheduled_date:deadline }])); // stale preview
assert.equal((await db.query(`select scheduled_date::text as scheduled from public.study_tasks where id=$1`, [task])).rows[0].scheduled, today);
await db.query(`update public.study_tasks set completed=true, completed_at=now() where id=$1`, [task]);
await assert.rejects(apply([{ id:task, scheduled_date:deadline }], await snapshot()));
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [userB]);
await assert.rejects(apply([], []));
console.log('PASS: migrations are repeatable; ownership, storage isolation, capacity, stale previews, completed tasks and atomic rollback verified.');
await db.close();
