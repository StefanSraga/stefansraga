-- ============================================================
--  Migration: photo-only entries on the Videos page
--  Supabase → SQL Editor → paste → Run. Safe to re-run.
--
--  Why: the "VlaďkySyn" promo entry is a set of photos, not a video.
--  It used to live only in assets/data/videos.json, so it could not be
--  edited or deleted from /admin. This gives the videos table a photo
--  list, then moves that entry into the database where the client owns it.
-- ============================================================

-- 1) photo list for a video row ("" video + photos = a gallery card)
alter table public.videos
  add column if not exists images jsonb not null default '[]'::jsonb;

-- 2) move the VlaďkySyn collab into the database (skipped if already there)
insert into public.videos (title, category, description, video, poster, orientation, images, sort, published)
select
  'VlaďkySyn',
  'promo',
  'Long-term collaboration with VlaďkySyn — a set of promo visuals from our shared shoots.',
  '',
  '/assets/img/491946_1befe98eb999420ebaa6c848508f806ef003.jpg',
  'portrait',
  '["/assets/img/491946_1befe98eb999420ebaa6c848508f806ef003.jpg",
    "/assets/img/491946_255006e7f03f48f48e9a4cadfbdef2fcf003.jpg",
    "/assets/img/491946_12191d3418514f45af4c658d78af8e08f003.jpg",
    "/assets/img/491946_d81cea3784b440e699aabb041418e83cf003.jpg"]'::jsonb,
  coalesce((select max(sort) from public.videos), 0) + 1,
  true
where not exists (
  select 1 from public.videos where lower(title) = lower('VlaďkySyn')
);

-- Check it landed:
--   select title, category, jsonb_array_length(images) as fotek from public.videos where images <> '[]'::jsonb;
