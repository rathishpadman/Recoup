create extension if not exists pgcrypto with schema extensions;

create table if not exists recoup_demo_users (
  login_id text primary key,
  display_name text not null,
  role text not null check (role in ('maya', 'david', 'cfo')),
  default_route text not null,
  allowed_routes text[] not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recoup_demo_users enable row level security;
revoke all on table recoup_demo_users from public, anon, authenticated;
grant select, insert, update on table recoup_demo_users to service_role;

drop policy if exists recoup_demo_users_no_client_access on recoup_demo_users;
create policy recoup_demo_users_no_client_access
  on recoup_demo_users
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into recoup_demo_users (
  login_id,
  display_name,
  role,
  default_route,
  allowed_routes,
  password_hash
) values
  ('Maya', 'Maya Patel', 'maya', '/forensics', array['/forensics', '/run'], extensions.crypt('Welcome#123', extensions.gen_salt('bf'))),
  ('david', 'David Kim', 'david', '/credit', array['/credit'], extensions.crypt('Welcome#123', extensions.gen_salt('bf'))),
  (
    'CFO',
    'CFO',
    'cfo',
    '/cfo',
    array['/cfo', '/governance/agents', '/governance/connectors', '/governance/memory', '/governance/trace'],
    extensions.crypt('Welcome#123', extensions.gen_salt('bf'))
  )
on conflict (login_id) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  default_route = excluded.default_route,
  allowed_routes = excluded.allowed_routes,
  password_hash = excluded.password_hash,
  updated_at = now();

create or replace function verify_recoup_demo_login(p_login_id text, p_password text)
returns table (
  login_id text,
  display_name text,
  role text,
  default_route text,
  allowed_routes text[]
)
language sql
security definer
set search_path = public
as $$
  select
    u.login_id,
    u.display_name,
    u.role,
    u.default_route,
    u.allowed_routes
  from recoup_demo_users u
  where u.login_id = p_login_id
    and u.password_hash = extensions.crypt(p_password, u.password_hash);
$$;

revoke all on function verify_recoup_demo_login(text, text) from public, anon, authenticated;
grant execute on function verify_recoup_demo_login(text, text) to service_role;
