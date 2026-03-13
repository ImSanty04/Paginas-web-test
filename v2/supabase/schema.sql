-- Ejecutar en el SQL Editor de Supabase
-- Proyecto nuevo - esquema para Admin de Servicios

create extension if not exists pgcrypto;

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null unique check (storage_path like 'public/%'),
  public_url text not null,
  alt_text text,
  caption text,
  sort_order integer not null default 1000,
  featured_home boolean not null default false,
  home_rank integer check (home_rank between 1 and 3),
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index if not exists ux_gallery_home_rank_active
on public.gallery_items (home_rank)
where featured_home = true and is_deleted = false and home_rank is not null;

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  home_mode text not null default 'auto' check (home_mode in ('auto', 'manual')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_gallery_items_updated_at on public.gallery_items;
create trigger trg_gallery_items_updated_at
before update on public.gallery_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

insert into public.app_settings (id, home_mode)
values (1, 'auto')
on conflict (id) do nothing;

alter table public.gallery_items enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Public read gallery published" on public.gallery_items;
create policy "Public read gallery published"
on public.gallery_items
for select
to anon, authenticated
using (is_deleted = false);

drop policy if exists "Admin full access gallery_items" on public.gallery_items;
create policy "Admin full access gallery_items"
on public.gallery_items
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "Public read app_settings" on public.app_settings;
create policy "Public read app_settings"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admin full access app_settings" on public.app_settings;
create policy "Admin full access app_settings"
on public.app_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "Authenticated read own profile" on public.profiles;
create policy "Authenticated read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admin manage profiles" on public.profiles;
-- IMPORTANTE:
-- No crear policies en profiles que consulten public.profiles dentro de su USING/WITH CHECK,
-- porque generan recursion infinita de RLS.
-- La gestion de roles se realiza desde SQL Editor (owner) o backend con service role.

insert into storage.buckets (id, name, public)
values ('gallery-media', 'gallery-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read gallery-media" on storage.objects;
create policy "Public read gallery-media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'gallery-media' and name like 'public/%');

drop policy if exists "Admin manage gallery-media" on storage.objects;
create policy "Admin manage gallery-media"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'gallery-media'
  and name like 'public/%'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  bucket_id = 'gallery-media'
  and name like 'public/%'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
);

-- DespuÃ©s de crear tu usuario admin en Auth > Users:
-- insert into public.profiles (user_id, role)
-- values ('UUID_DEL_USUARIO', 'admin')
-- on conflict (user_id) do update set role = excluded.role;

