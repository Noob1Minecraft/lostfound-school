-- Read-only: run AFTER all three migrations in the staging SQL Editor.
select schemaname,tablename,rowsecurity from pg_tables
where (schemaname='public' and tablename in ('profiles','items','matches','claims'))
   or (schemaname='private' and tablename in ('school_members','api_rate_limits')); -- all true
select id,public,file_size_limit,allowed_mime_types from storage.buckets
where id='item-images'; -- false, 5242880, {image/webp}
select policyname,cmd,roles from pg_policies
where schemaname='storage' and tablename='objects'; -- inspect ALL policies; no broad client INSERT/UPDATE/DELETE policy
select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'; -- definer helpers pin search_path
select has_function_privilege('anon','public.save_item(uuid,jsonb)','EXECUTE') as anon_write,
       has_table_privilege('authenticated','public.profiles','UPDATE') as student_role_update,
       has_table_privilege('authenticated','public.items','INSERT') as direct_item_insert;
-- All false. Writes go through checked RPC functions only.
select count(*) as users_without_profile from auth.users u
left join public.profiles p on p.id=u.id where p.id is null; -- zero

-- Vercel adapter requires the third migration. Expected true, false, false, true.
select (select relrowsecurity from pg_class where oid='private.api_rate_limits'::regclass) as counter_rls,
 has_table_privilege('authenticated','private.api_rate_limits','UPDATE') as client_counter_update,
 has_function_privilege('anon','public.consume_api_rate_limit(text)','EXECUTE') as anon_rate_rpc,
 has_function_privilege('authenticated','public.consume_api_rate_limit(text)','EXECUTE') as member_rate_rpc;
