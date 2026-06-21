create table if not exists public.scenarios (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_deltas (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scenarios enable row level security;
alter table public.scenario_deltas enable row level security;

drop policy if exists scenarios_read on public.scenarios;
create policy scenarios_read on public.scenarios
  for select using (public.app_is_org_member(org_id));

drop policy if exists scenarios_write on public.scenarios;
create policy scenarios_write on public.scenarios
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists scenario_deltas_read on public.scenario_deltas;
create policy scenario_deltas_read on public.scenario_deltas
  for select using (public.app_is_org_member(org_id));

drop policy if exists scenario_deltas_write on public.scenario_deltas;
create policy scenario_deltas_write on public.scenario_deltas
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

create index if not exists scenarios_org_id_idx on public.scenarios (org_id);
create index if not exists scenario_deltas_org_id_idx on public.scenario_deltas (org_id);

drop trigger if exists scenarios_touch on public.scenarios;
create trigger scenarios_touch before update on public.scenarios
  for each row execute function public.touch_updated_at();

drop trigger if exists scenario_deltas_touch on public.scenario_deltas;
create trigger scenario_deltas_touch before update on public.scenario_deltas
  for each row execute function public.touch_updated_at();
