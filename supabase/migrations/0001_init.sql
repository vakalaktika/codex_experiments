-- Idea-to-Feature Capture — initial schema.
-- See docs/ARCHITECTURE.md §4 for the reasoning behind each departure from the
-- data model in the original brief.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type note_source as enum ('voice', 'text');
create type prompt_status as enum ('draft', 'approved', 'sent');

-- ---------------------------------------------------------------- tables
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  description   text,
  github_owner  text check (github_owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  github_repo   text check (github_repo  ~ '^[A-Za-z0-9._-]{1,100}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- link a repo with both halves or neither
  constraint github_pair check (
    (github_owner is null) = (github_repo is null)
  )
);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Nullable on purpose — a departure from ARCHITECTURE.md §4, which had this
  -- not null. The capture target is tap-to-saved in under ten seconds, and
  -- forcing a project choice before the idea is written down fights that
  -- directly: on first run there is no project to choose, and the outbox type
  -- has always allowed null. An unfiled note is an inbox item, filed from the
  -- Capture screen afterwards. Prompt generation still requires a project,
  -- since a feature prompt without project context is not worth generating.
  project_id  uuid references public.projects(id) on delete cascade,
  raw_text    text not null check (length(trim(raw_text)) > 0),
  source      note_source not null default 'text',
  -- idempotency key from the offline outbox: a retried flush must not duplicate
  client_id   uuid,
  created_at  timestamptz not null default now()
);

create table public.feature_prompts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  note_id        uuid not null references public.notes(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  generated_text text not null,
  edited_text    text,
  status         prompt_status not null default 'draft',
  model          text,                       -- provenance: which model drafted it
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes
create index projects_user_updated_idx        on public.projects (user_id, updated_at desc);
create index notes_project_created_idx        on public.notes (project_id, created_at desc);
-- drives the unfiled inbox, which filters on user_id with project_id is null
create index notes_user_created_idx           on public.notes (user_id, created_at desc);
create unique index notes_user_client_id_uidx on public.notes (user_id, client_id)
  where client_id is not null;
create index prompts_project_created_idx      on public.feature_prompts (project_id, created_at desc);
create index prompts_note_idx                 on public.feature_prompts (note_id);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger prompts_touch before update on public.feature_prompts
  for each row execute function public.touch_updated_at();

-- keep "last activity" on the project card honest
create or replace function public.touch_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- an unfiled note has no project to touch
  if new.project_id is not null then
    update public.projects set updated_at = now() where id = new.project_id;
  end if;
  return new;
end $$;

create trigger notes_touch_project after insert on public.notes
  for each row execute function public.touch_project();

-- ---------------------------------------------------------------- RLS
alter table public.projects        enable row level security;
alter table public.notes           enable row level security;
alter table public.feature_prompts enable row level security;

create policy projects_owner on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notes_owner on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prompts_owner on public.feature_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- default user_id from the JWT so the client never has to send it
alter table public.projects        alter column user_id set default auth.uid();
alter table public.notes           alter column user_id set default auth.uid();
alter table public.feature_prompts alter column user_id set default auth.uid();
