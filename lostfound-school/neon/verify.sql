-- Read-only hosted verification. Run after 001_school.sql with an operator connection.
-- Expected: every check below is true; role metadata shows NOLOGIN, no bypass,
-- no superuser, and neither runtime role owns application tables.
-- PGlite tests verify real RLS, grants, claims, roles, rate limits and reload.
-- Still required in hosted preview: two independent connections must demonstrate
-- that revocation committed while a mutation waits for advisory lock 7102026
-- is observed by the mutation after it acquires that lock.
begin read only;
select rolname,not rolcanlogin as no_login,not rolsuper as not_superuser,
 not rolbypassrls as no_rls_bypass,
 not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relowner=r.oid) as owns_no_tables
from pg_roles r where rolname in ('school_app','school_identity') order by rolname;
select n.nspname as schema,c.relname as table_name,c.relrowsecurity as rls_enabled,
 pg_get_userbyid(c.relowner) not in ('school_app','school_identity') as separate_owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and ((n.nspname='public' and c.relname in ('profiles','items','matches','claims'))
 or (n.nspname='private' and c.relname in ('identities','school_members','api_rate_limits','member_audit')))
order by n.nspname,c.relname;
select not has_function_privilege('school_app','private.provision_identity(text,text,text)','EXECUTE') as app_cannot_provision,
 has_function_privilege('school_identity','private.provision_identity(text,text,text)','EXECUTE') as identity_can_provision,
 not has_table_privilege('school_app','private.member_audit','INSERT,UPDATE,DELETE') as app_cannot_rewrite_audit,
 not has_table_privilege('school_app','public.profiles','UPDATE') as app_cannot_assign_roles,
 not has_table_privilege('school_app','private.identities','SELECT') as app_cannot_read_identity_map,
 not has_table_privilege('school_app','private.school_members','UPDATE') as app_cannot_write_allowlist,
 not has_schema_privilege('school_app','public','CREATE') as app_cannot_create_public_objects,
 not has_schema_privilege('school_identity','public','CREATE') as identity_cannot_create_public_objects;
select schemaname,tablename,policyname,roles,cmd,qual from pg_policies
where schemaname='public' and tablename in ('profiles','items','matches','claims')
order by tablename,policyname;
commit;
