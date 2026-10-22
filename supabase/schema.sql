-- Ledgerline: run once in Supabase SQL editor.
create table if not exists public.vaults(
  user_id uuid primary key references auth.users(id) on delete cascade,
  rev bigint not null default 1,
  kdf jsonb not null,
  wrap_pass text not null,
  rec_salt text not null,
  wrap_rec text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
create policy vaults_select on public.vaults for select to authenticated using (auth.uid()=user_id);
create policy vaults_insert on public.vaults for insert to authenticated with check (auth.uid()=user_id);
create policy vaults_update on public.vaults for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy vaults_delete on public.vaults for delete to authenticated using (auth.uid()=user_id);

create table if not exists public.ai_usage(
  user_id uuid references auth.users(id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key(user_id,day)
);
alter table public.ai_usage enable row level security; -- no policies: only the service role can touch it

create or replace function public.ai_take(uid uuid, lim int) returns boolean
language plpgsql security definer set search_path=public as $$
declare c int;
begin
  insert into public.ai_usage(user_id,day,calls) values(uid,current_date,1)
  on conflict(user_id,day) do update set calls=public.ai_usage.calls+1 where public.ai_usage.calls<lim
  returning calls into c;
  return c is not null;
end $$;
revoke all on function public.ai_take(uuid,int) from public,anon,authenticated;
grant execute on function public.ai_take(uuid,int) to service_role;

-- 30-day recovery for a deleted cloud vault: the app marks deleted_at; this job removes it for good after 30 days.
alter table public.vaults add column if not exists deleted_at timestamptz;
create extension if not exists pg_cron;
select cron.schedule('ledgerline-purge-vaults','17 3 * * *',$$delete from public.vaults where deleted_at is not null and deleted_at < now() - interval '30 days'$$);
