create extension if not exists pg_cron;

create index if not exists shared_tournaments_created_at_idx
  on public.shared_tournaments (created_at);

create or replace function public.delete_expired_shared_lobbies()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.shared_tournaments
  where created_at <= now() - interval '60 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_expired_shared_lobbies() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'delete-expired-shared-lobbies'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'delete-expired-shared-lobbies',
  '0 * * * *',
  $cron$select public.delete_expired_shared_lobbies();$cron$
);

select public.delete_expired_shared_lobbies();
