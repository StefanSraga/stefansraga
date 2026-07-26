-- ============================================================
--  stefansraga.com — CMS schema (Supabase / Postgres)
--  Run this once in your Supabase project: SQL Editor → paste → Run.
--  Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ---------- helper: keep updated_at fresh ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
--  TABLES
-- ============================================================

-- video categories (client can add/rename/reorder)
create table if not exists public.categories (
  id          text primary key,           -- e.g. "esport"
  label       text not null,              -- e.g. "Esport"
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- videos (each video is basically a YouTube link + a bit of metadata)
create table if not exists public.videos (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text references public.categories(id) on delete set null,
  description  text default '',
  video        text default '',           -- YouTube link (or an mp4 path, or "" = coming soon)
  poster       text,                       -- optional; auto-derived from YouTube when null
  orientation  text not null default 'landscape',  -- 'landscape' | 'portrait'
  images       jsonb not null default '[]'::jsonb,  -- photo-only entry: [] = normal video
  sort         int  not null default 0,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- existing databases: add the photo list without touching anything else
alter table public.videos add column if not exists images jsonb not null default '[]'::jsonb;

-- blog posts
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  cover        text,                       -- image url (Supabase Storage)
  excerpt      text default '',
  body         text default '',            -- HTML content
  date         text default '',            -- display date, e.g. "11. 3. 2026"
  read_time    text default '',            -- e.g. "Minut čtení: 2"
  views        int  not null default 0,
  sort         int  not null default 0,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- photo galleries (Events, Cars, Urbex, …)
create table if not exists public.galleries (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  hero         text,                       -- hero image url
  intro        text default '',            -- HTML intro paragraph
  sort         int  not null default 0,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- article tags (filtering + search on the blog)
alter table public.posts add column if not exists tags text[] not null default '{}';

-- blog card shape the owner picks per post: 'normal' (square, 2-up grid) or
-- 'wide' (rectangular, full-width split). The first post is always the big one.
alter table public.posts add column if not exists layout text not null default 'normal';

-- site settings (key/value; e.g. homepage videos swapped from the admin)
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- real view counting: anonymous visitors may bump a published post's counter
-- by exactly +1 via this function — they still have NO update rights on posts.
create or replace function public.bump_views(post_slug text)
returns void
language sql security definer set search_path = public as $$
  update public.posts set views = views + 1 where slug = post_slug and published;
$$;
revoke all on function public.bump_views(text) from public;
grant execute on function public.bump_views(text) to anon, authenticated;

-- images inside a gallery
create table if not exists public.gallery_images (
  id           uuid primary key default gen_random_uuid(),
  gallery_id   uuid not null references public.galleries(id) on delete cascade,
  url          text not null,
  alt          text default '',
  sort         int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists gallery_images_gallery_idx on public.gallery_images(gallery_id);

-- updated_at triggers
drop trigger if exists trg_videos_updated on public.videos;
create trigger trg_videos_updated before update on public.videos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_posts_updated on public.posts;
create trigger trg_posts_updated before update on public.posts
  for each row execute function public.set_updated_at();
drop trigger if exists trg_galleries_updated on public.galleries;
create trigger trg_galleries_updated before update on public.galleries
  for each row execute function public.set_updated_at();

-- ============================================================
--  ADMIN ALLOWLIST
--  Writes are NOT granted to just any logged-in user — they are
--  granted only to e-mail addresses listed in admin_emails. This is
--  defence-in-depth: even if public sign-up were ever turned on by
--  mistake, a new random account still could not change anything.
--
--  >>> REQUIRED SETUP STEP <<<
--  After you create your admin user (Authentication → Users → Add user),
--  add that same e-mail here, e.g.:
--      insert into public.admin_emails (email) values ('info@stefansraga.cz');
-- ============================================================
create table if not exists public.admin_emails (
  email text primary key
);
-- No RLS policies on this table → the API (anon + authenticated) cannot read
-- or change it at all. Manage it only from the Supabase SQL editor.
alter table public.admin_emails enable row level security;

-- is_admin(): true when the caller's JWT e-mail is in the allowlist.
-- security definer → the function bypasses RLS to read admin_emails.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ============================================================
--  ROW LEVEL SECURITY
--  Public (anon) can only READ published content.
--  Only an allow-listed admin (is_admin()) can write or see drafts.
-- ============================================================

alter table public.categories     enable row level security;
alter table public.videos         enable row level security;
alter table public.posts          enable row level security;
alter table public.galleries      enable row level security;
alter table public.gallery_images enable row level security;
alter table public.settings       enable row level security;

-- settings: readable by everyone (homepage reads them), writable by admin
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- categories: readable by everyone, writable by admin
drop policy if exists cat_read  on public.categories;
create policy cat_read  on public.categories for select using (true);
drop policy if exists cat_write on public.categories;
create policy cat_write on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- videos: public reads published rows; admin reads/writes everything
drop policy if exists vid_read on public.videos;
create policy vid_read on public.videos for select
  using (published or public.is_admin());
drop policy if exists vid_write on public.videos;
create policy vid_write on public.videos for all
  using (public.is_admin()) with check (public.is_admin());

-- posts
drop policy if exists post_read on public.posts;
create policy post_read on public.posts for select
  using (published or public.is_admin());
drop policy if exists post_write on public.posts;
create policy post_write on public.posts for all
  using (public.is_admin()) with check (public.is_admin());

-- galleries
drop policy if exists gal_read on public.galleries;
create policy gal_read on public.galleries for select
  using (published or public.is_admin());
drop policy if exists gal_write on public.galleries;
create policy gal_write on public.galleries for all
  using (public.is_admin()) with check (public.is_admin());

-- gallery images (readable if their gallery is published or admin)
drop policy if exists galimg_read on public.gallery_images;
create policy galimg_read on public.gallery_images for select
  using (
    public.is_admin()
    or exists (select 1 from public.galleries g where g.id = gallery_id and g.published)
  );
drop policy if exists galimg_write on public.gallery_images;
create policy galimg_write on public.gallery_images for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  STORAGE  (bucket for admin-uploaded images: covers, gallery photos)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- public can read files; only an allow-listed admin can upload/replace/delete
drop policy if exists media_read   on storage.objects;
create policy media_read   on storage.objects for select
  using (bucket_id = 'media');
drop policy if exists media_write  on storage.objects;
create policy media_write  on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());
