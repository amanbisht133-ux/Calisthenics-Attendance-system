-- ============================================================================
-- Database storage usage for the Admin panel. Uses plain Postgres catalog
-- functions (pg_database_size / pg_total_relation_size) rather than the
-- Supabase Management API, so no account-wide access token is needed -- this
-- only reports this one project's own storage, nothing else.
-- ============================================================================

create or replace function public.admin_database_size()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view database usage.';
  end if;

  select jsonb_build_object(
    'total_bytes', pg_database_size(current_database()),
    'tables', (
      select jsonb_agg(
        jsonb_build_object(
          'name', tablename,
          'bytes', pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)
        )
        order by pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass) desc
      )
      from pg_catalog.pg_tables
      where schemaname = 'public'
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_database_size() to authenticated;
