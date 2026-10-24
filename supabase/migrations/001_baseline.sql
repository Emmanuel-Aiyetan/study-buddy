-- Baseline for a new project; existing tables/data are preserved.
begin;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text
);
create table if not exists public.study_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, goal text not null, deadline date,
 knowledge_level text, study_time numeric, status text not null default 'active',
 created_at timestamptz not null default now()
);
create table if not exists public.study_tasks (
 id uuid primary key default gen_random_uuid(),
 study_plan_id uuid not null references public.study_plans(id) on delete cascade,
 title text not null, description text, scheduled_date date,
 estimated_minutes integer, completed boolean not null default false,
 completed_at timestamptz
);
create table if not exists public.study_materials (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 study_plan_id uuid not null references public.study_plans(id) on delete cascade,
 file_name text not null, file_path text not null, file_type text, file_size bigint,
 created_at timestamptz not null default now()
);
create or replace function public.handle_new_study_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id, full_name) values(new.id, new.raw_user_meta_data->>'full_name') on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists study_buddy_new_user on auth.users;
create trigger study_buddy_new_user after insert on auth.users for each row execute function public.handle_new_study_user();
insert into public.profiles(id, full_name) select id, raw_user_meta_data->>'full_name' from auth.users on conflict(id) do nothing;
commit;
