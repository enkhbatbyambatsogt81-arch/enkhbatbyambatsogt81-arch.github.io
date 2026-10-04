-- Portfolio site: tables, access rules and storage for Supabase.
-- Run once: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again: it only creates what is missing.

create extension if not exists pgcrypto;

-- ───────────── who may edit the site ─────────────
-- Sign in with Google using this address to get the editing tools.
create table if not exists public.owners (email text primary key);
insert into public.owners (email) values ('enkhbatbyambatsogt81@gmail.com') on conflict do nothing;
alter table public.owners enable row level security;   -- no policies: only the functions below read it

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where lower(email) = public.my_email() and public.my_email() <> '')
$$;

-- ───────────── content ─────────────
create table if not exists public.profile (
  id int primary key default 1 check (id = 1),
  name text not null default '', headline text not null default '', bio text not null default '',
  location text not null default '', email text not null default '', phone text not null default '',
  links jsonb not null default '[]', photo_path text, cv_path text,
  updated_at timestamptz not null default now()
);
insert into public.profile (id) values (1) on conflict do nothing;

create table if not exists public.cv_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('edu', 'work', 'project', 'skill', 'award')),
  title text not null, org text not null default '', period text not null default '', descr text not null default '',
  hidden boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id text primary key,
  code text not null default '', name text not null default '', semester text not null default '',
  credits numeric, kind text not null default '', teacher text not null default '', descr text not null default '',
  is_current boolean not null default false, hidden boolean not null default false
);

-- one row per uploaded file; `name` is its path inside the course, e.g. 'Лаб 7 · IP чиглүүлэлт/lab7.1.pkt'
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  name text not null,
  size bigint not null default 0, mime text not null default '',
  storage_path text not null unique,          -- object key in the 'course-files' bucket: '<course_id>/<uuid>.<ext>'
  tag text not null default '' check (tag in ('', 'lec', 'sem', 'lab', 'hw', 'none')),
  created_at timestamptz not null default now(),
  unique (course_id, name)
);

-- who may open which course's files, by the Google e-mail they sign in with
create table if not exists public.people (
  email text primary key check (email = lower(email)),
  label text not null default '',
  courses text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ───────────── access rules ─────────────
alter table public.profile  enable row level security;
alter table public.cv_items enable row level security;
alter table public.courses  enable row level security;
alter table public.files    enable row level security;
alter table public.people   enable row level security;

drop policy if exists "profile: everyone reads" on public.profile;
drop policy if exists "profile: owner writes" on public.profile;
create policy "profile: everyone reads" on public.profile for select using (true);
create policy "profile: owner writes" on public.profile for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "cv: everyone reads shown items" on public.cv_items;
drop policy if exists "cv: owner writes" on public.cv_items;
create policy "cv: everyone reads shown items" on public.cv_items for select using (not hidden or public.is_owner());
create policy "cv: owner writes" on public.cv_items for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "courses: everyone reads shown, granted see theirs" on public.courses;
drop policy if exists "courses: owner writes" on public.courses;
create policy "courses: everyone reads shown, granted see theirs" on public.courses for select using (
  not hidden or public.is_owner()
  or exists (select 1 from public.people p where p.email = public.my_email() and courses.id = any (p.courses)));
create policy "courses: owner writes" on public.courses for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "files: owner and granted people read" on public.files;
drop policy if exists "files: owner writes" on public.files;
create policy "files: owner and granted people read" on public.files for select using (
  public.is_owner()
  or exists (select 1 from public.people p where p.email = public.my_email() and files.course_id = any (p.courses)));
create policy "files: owner writes" on public.files for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "people: owner and the person read" on public.people;
drop policy if exists "people: owner writes" on public.people;
create policy "people: owner and the person read" on public.people for select using (public.is_owner() or email = public.my_email());
create policy "people: owner writes" on public.people for all using (public.is_owner()) with check (public.is_owner());

-- ───────────── storage ─────────────
-- course files are private (opened through short-lived signed links); the profile photo and CV are public
insert into storage.buckets (id, name, public, file_size_limit) values ('course-files', 'course-files', false, 52428800)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('site-public', 'site-public', true, 52428800)
  on conflict (id) do nothing;

drop policy if exists "course files: owner manages" on storage.objects;
drop policy if exists "course files: granted people read" on storage.objects;
drop policy if exists "site public: owner manages" on storage.objects;
create policy "course files: owner manages" on storage.objects for all to authenticated
  using (bucket_id = 'course-files' and public.is_owner())
  with check (bucket_id = 'course-files' and public.is_owner());
create policy "course files: granted people read" on storage.objects for select to authenticated
  using (bucket_id = 'course-files' and exists (
    select 1 from public.people p
    where p.email = public.my_email() and (storage.foldername(storage.objects.name))[1] = any (p.courses)));
create policy "site public: owner manages" on storage.objects for all to authenticated
  using (bucket_id = 'site-public' and public.is_owner())
  with check (bucket_id = 'site-public' and public.is_owner());

-- ───────────── courses from the transcript ─────────────
insert into public.courses (id, code, name, semester, credits, kind, descr, is_current) values
  ('fndp100', 'FNDP100', 'Гамшгаас хамгаалах менежментийн үндэс', '2025–2026, Намрын улирал', 1, 'Ерөнхий суурь', '', false),
  ('math101', 'MATH101', 'Нэг хувьсагчийн функцийн онол 1б', '2025–2026, Намрын улирал', 3, 'Ерөнхий суурь', '', false),
  ('itcs100', 'ITCS100', 'Компьютер тооцооллын зарчим', '2025–2026, Намрын улирал', 3, 'Ерөнхий суурь', '', false),
  ('biol102', 'BIOL102', 'Экологи ба тогтвортой байдал', '2025–2026, Намрын улирал', 3, 'Ерөнхий суурь', '', false),
  ('math100', 'MATH100', 'Шугаман алгебр 1', '2025–2026, Намрын улирал', 3, 'Ерөнхий суурь', '', false),
  ('aeng123', 'AENG123', 'Академик англи хэл 3 (Ахисан дунд)', '2025–2026, Намрын улирал', 3, 'Ерөнхий суурь', '', false),
  ('finn110', 'FINN110', 'Хувь хүний санхүү', '2025–2026, Хаврын улирал', 3, 'Ерөнхий суурь', '', false),
  ('csii202', 'CSII202', 'Өгөгдлийн сангийн үндэс', '2025–2026, Хаврын улирал', 3, '',
     E'SQL лабораториуд, ER/EER диаграм, нормчлол.\nТөсөл: зогсоолын менежментийн өгөгдлийн сан (EERD, BCNF, MySQL).', false),
  ('csii201', 'CSII201', 'Программчлалын хэл', '2025–2026, Хаврын улирал', 3, '', 'C хэлний лабораториуд: заагч, тэмдэгт мөр, бүтэц (struct).', false),
  ('ecen213', 'ECEN213', 'Компьютерын сүлжээ', '2025–2026, Хаврын улирал', 3, '',
     'Лаб 1–12: HTTP, DNS, TCP ба UDP, IP протокол, Packet Tracer, IP чиглүүлэлт, NAT, ARP ба ICMP, VLAN, DHCP ба VTP, IPv6.', false),
  ('hist101', 'HIST101', 'Монголын түүх', '2025–2026, Хаврын улирал', 3, 'Ерөнхий суурь', '', false),
  ('cult104', 'CULT104', 'Академик бичих ур чадвар', '2025–2026, Хаврын улирал', 3, 'Ерөнхий суурь', '', false),
  ('icsi207', 'ICSI207', 'Үйлдлийн системийн онол', '2026–2027, Намрын улирал', 3, '', E'Лаб 1: shell бичих\nЛаб 2: Линуксийн цөмийн модуль', true),
  ('icsi202', 'ICSI202', 'Өгөгдлийн бүтэц', '2026–2027, Намрын улирал', 3, '',
     E'Лаб 1: C хэл сэргээх\nЛаб 2: Эрэмбэлэх функц\nЛаб 3: Жагсаалт, стек, дараалал\nЛаб 4: Бүрэн хоёртын мод', true),
  ('math282', 'MATH282', 'Математик логик ба дискрет математик', '2026–2027, Намрын улирал', 3, '', '', true),
  ('icsi201', 'ICSI201', 'Объект хандлагат программчлал', '2026–2027, Намрын улирал', 3, '', '', true),
  ('icsi440', 'ICSI440', 'Хүн компьютерын харилцаа', '2026–2027, Намрын улирал', 3, '', '', true),
  ('icsi204', 'ICSI204', 'Хиймэл оюун 1', '2026–2027, Намрын улирал', 3, '', '', true)
on conflict (id) do nothing;
