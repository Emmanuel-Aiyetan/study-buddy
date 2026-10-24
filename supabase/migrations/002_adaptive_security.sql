begin;
create table if not exists public.quiz_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 study_plan_id uuid not null references public.study_plans(id) on delete cascade,
 material_id uuid not null references public.study_materials(id) on delete cascade,
 score integer not null, total integer not null check(total > 0),
 review_questions jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(), check(score >= 0 and score <= total)
);
create index if not exists study_tasks_plan_date_idx on public.study_tasks(study_plan_id, scheduled_date);
create index if not exists study_plans_owner_idx on public.study_plans(user_id);
create index if not exists quiz_attempts_owner_idx on public.quiz_attempts(user_id, created_at desc);
-- Restrictive guards combine with old policies using AND, protecting existing installations.
alter table public.profiles enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_materials enable row level security;
alter table public.quiz_attempts enable row level security;

drop policy if exists sb_access on public.profiles;
create policy sb_access on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists sb_guard on public.profiles;
create policy sb_guard on public.profiles as restrictive for all to public using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists sb_access on public.study_plans;
create policy sb_access on public.study_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists sb_guard on public.study_plans;
create policy sb_guard on public.study_plans as restrictive for all to public using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists sb_access on public.study_tasks;
create policy sb_access on public.study_tasks for all to authenticated
 using(exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()))
 with check(exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()));
drop policy if exists sb_guard on public.study_tasks;
create policy sb_guard on public.study_tasks as restrictive for all to public
 using(exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()))
 with check(exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()));
drop policy if exists sb_access on public.study_materials;
create policy sb_access on public.study_materials for all to authenticated using(user_id=auth.uid())
 with check(user_id=auth.uid() and (storage.foldername(file_path))[1]=auth.uid()::text and exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()));
drop policy if exists sb_guard on public.study_materials;
create policy sb_guard on public.study_materials as restrictive for all to public using(user_id=auth.uid())
 with check(user_id=auth.uid() and (storage.foldername(file_path))[1]=auth.uid()::text and exists(select 1 from public.study_plans p where p.id=study_plan_id and p.user_id=auth.uid()));
drop policy if exists sb_access on public.quiz_attempts;
create policy sb_access on public.quiz_attempts for all to authenticated using(user_id=auth.uid())
 with check(user_id=auth.uid() and exists(select 1 from public.study_materials m where m.id=material_id and m.study_plan_id=quiz_attempts.study_plan_id and m.user_id=auth.uid()));
drop policy if exists sb_guard on public.quiz_attempts;
create policy sb_guard on public.quiz_attempts as restrictive for all to public using(user_id=auth.uid())
 with check(user_id=auth.uid() and exists(select 1 from public.study_materials m where m.id=material_id and m.study_plan_id=quiz_attempts.study_plan_id and m.user_id=auth.uid()));
grant select, insert, update, delete on public.profiles, public.study_plans, public.study_tasks, public.study_materials, public.quiz_attempts to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
 values('study-materials', 'study-materials', false, 10485760, array['application/pdf'])
 on conflict(id) do update set public=false, file_size_limit=10485760, allowed_mime_types=array['application/pdf'];
drop policy if exists sb_storage_access on storage.objects;
create policy sb_storage_access on storage.objects for all to authenticated
 using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text)
 with check(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists sb_storage_guard on storage.objects;
create policy sb_storage_guard on storage.objects as restrictive for all to public
 using(bucket_id<>'study-materials' or (storage.foldername(name))[1]=auth.uid()::text)
 with check(bucket_id<>'study-materials' or (storage.foldername(name))[1]=auth.uid()::text);

-- One transaction applies all dates or none. Invoker privileges preserve RLS.
create or replace function public.adapt_study_plan(
 p_plan_id uuid, p_deadline date, p_hours numeric, p_today date, p_expected jsonb, p_schedule jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare current_snapshot jsonb; supplied_snapshot jsonb; task_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_expected is null or p_schedule is null or jsonb_typeof(p_expected)<>'array' or jsonb_typeof(p_schedule)<>'array' then raise exception 'Invalid schedule'; end if;
 if p_hours is null or p_hours < .25 or p_hours > 12 or p_hours::text='NaN'
   or p_today is null or abs(p_today-current_date)>1 or p_deadline is null or p_deadline<p_today or p_deadline>p_today+366 then
   raise exception 'Invalid availability or deadline';
 end if;
 perform 1 from public.study_plans where id=p_plan_id and user_id=auth.uid() for update;
 if not found then raise exception 'Plan not found'; end if;
 perform 1 from public.study_tasks where study_plan_id=p_plan_id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'scheduled_date',scheduled_date,'completed',completed,'estimated_minutes',estimated_minutes) order by id), '[]'::jsonb)
 into current_snapshot from public.study_tasks where study_plan_id=p_plan_id;
 select coalesce(jsonb_agg(e order by (e->>'id')::uuid), '[]'::jsonb) into supplied_snapshot from jsonb_array_elements(p_expected) e;
 if current_snapshot is distinct from supplied_snapshot then raise exception 'Tasks changed. Refresh and preview again.'; end if;
 select count(*) into task_count from public.study_tasks where study_plan_id=p_plan_id and not completed;
 if jsonb_array_length(p_schedule)<>task_count or (select count(distinct e->>'id') from jsonb_array_elements(p_schedule) e)<>task_count then
   raise exception 'Schedule must contain every remaining task exactly once';
 end if;
 if exists(select 1 from jsonb_array_elements(p_schedule) e left join public.study_tasks t on t.id=(e->>'id')::uuid
    where t.id is null or t.study_plan_id<>p_plan_id or t.completed or e->>'scheduled_date' is null
    or (e->>'scheduled_date')::date not between p_today and p_deadline or coalesce(t.estimated_minutes,30)<=0) then
   raise exception 'Invalid task schedule';
 end if;
 if exists(select 1 from (
    select (e->>'scheduled_date')::date as day, coalesce(t.estimated_minutes,30) as minutes
      from jsonb_array_elements(p_schedule) e join public.study_tasks t on t.id=(e->>'id')::uuid
    union all
    select scheduled_date, coalesce(estimated_minutes,30) from public.study_tasks
      where study_plan_id=p_plan_id and completed and scheduled_date between p_today and p_deadline
    ) workload group by day having sum(minutes)>floor(p_hours*60)) then
   raise exception 'Daily workload exceeds availability';
 end if;
 update public.study_tasks t set scheduled_date=(e->>'scheduled_date')::date
 from jsonb_array_elements(p_schedule) e where t.id=(e->>'id')::uuid and t.study_plan_id=p_plan_id and not t.completed;
 update public.study_plans set deadline=p_deadline, study_time=p_hours where id=p_plan_id;
end $$;
revoke all on function public.adapt_study_plan(uuid,date,numeric,date,jsonb,jsonb) from public;
grant execute on function public.adapt_study_plan(uuid,date,numeric,date,jsonb,jsonb) to authenticated;
commit;
