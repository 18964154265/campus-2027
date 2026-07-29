-- ============================================================
-- 2027 秋招情报站：收藏夹功能建表脚本
-- 在 Supabase 控制台 SQL Editor 中整段执行一次即可
-- ============================================================

-- 1) 收藏夹表：每个用户可创建多个收藏夹
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now(),
  unique (user_id, name)                -- 同一用户下收藏夹名不重复
);

-- 2) 收藏的岗位表：岗位挂在某个收藏夹下
create table if not exists public.favorite_jobs (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references public.favorites (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company    text not null default '',   -- 公司名，如 字节跳动
  title      text not null default '',   -- 岗位名，如 商家运营实习生
  city       text not null default '',   -- 城市，如 上海/香港
  category   text not null default '',   -- 分类，如 商家/用户运营
  url        text not null,              -- 岗位详情页链接
  created_at timestamptz not null default now(),
  unique (folder_id, url)                -- 同一收藏夹内同一岗位不重复收藏
);

-- 3) 索引：按用户、按收藏夹查询
create index if not exists idx_favorites_user      on public.favorites (user_id);
create index if not exists idx_fav_jobs_user       on public.favorite_jobs (user_id);
create index if not exists idx_fav_jobs_folder     on public.favorite_jobs (folder_id);

-- 4) 开启行级安全（RLS）：没有策略默认拒绝一切访问
alter table public.favorites     enable row level security;
alter table public.favorite_jobs enable row level security;

-- 5) 行级安全策略：每个用户只能看到 / 操作自己的数据
-- favorites
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_update_own" on public.favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- favorite_jobs
create policy "fav_jobs_select_own" on public.favorite_jobs
  for select using (auth.uid() = user_id);
create policy "fav_jobs_insert_own" on public.favorite_jobs
  for insert with check (
    auth.uid() = user_id
    -- 且目标收藏夹必须属于当前用户，防止把岗位塞进别人的收藏夹
    and exists (
      select 1 from public.favorites f
      where f.id = folder_id and f.user_id = auth.uid()
    )
  );
create policy "fav_jobs_update_own" on public.favorite_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fav_jobs_delete_own" on public.favorite_jobs
  for delete using (auth.uid() = user_id);

-- 完成。执行成功后左侧 Table Editor 应能看到 favorites 和 favorite_jobs 两张表。
