-- Additive migration: apply after 20261110000000_school_mvp.sql.
-- Safe to apply to a staging project that already has the initial schema.
begin;

-- Accounts created before the original registration trigger need profiles too.
-- Never import roles from user-editable metadata or overwrite existing roles.
insert into public.profiles(id,display_name,role)
select id,coalesce(nullif(left(trim(raw_user_meta_data->>'display_name'),80),''),'Ученик'),'student'
from auth.users
on conflict(id) do nothing;

alter table private.school_members enable row level security;
-- No client policy: membership is operator-managed, including via direct REST/RPC.
create or replace function private.is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from auth.users u join private.school_members m on m.email=lower(u.email)
  where u.id=auth.uid() and u.email_confirmed_at is not null
    and coalesce(u.is_anonymous,false)=false
    and (u.banned_until is null or u.banned_until<=now())
    and u.deleted_at is null
 )
$$;
revoke all on function private.is_member() from public,anon;
grant execute on function private.is_member() to authenticated;

-- Only the trusted backend cleans orphan uploads. Client DELETE previously allowed
-- a removed member to delete old objects and raced attachment to a listing.
drop policy if exists image_cleanup on storage.objects;
-- Every stored image is sanitized WebP, so narrow the bucket to the actual format.
update storage.buckets set public=false,file_size_limit=5242880,allowed_mime_types=array['image/webp'] where id='item-images';
notify pgrst,'reload schema';
commit;
