-- Single-school MVP. Apply to an empty Supabase database via migrations.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table private.school_members(email text primary key check(email=lower(trim(email))));
revoke all on private.school_members from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80),
 role text not null default 'student' check(role in ('student','admin'))
);
create table public.items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 type text not null check(type in ('lost','found')), title text not null check(length(trim(title)) between 3 and 80),
 category text not null check(category in ('Электроника','Одежда','Школьные принадлежности','Аксессуары','Другое')),
 color text not null check(color in ('Чёрный','Белый','Синий','Красный','Зелёный','Серебряный','Другой')),
 location text not null check(location in ('Библиотека','Кабинет','Спортзал','Столовая','Коридор','Другое')),
 date date not null check(date <= (now() at time zone 'Asia/Qyzylorda')::date),
 description text not null check(length(trim(description)) between 5 and 400),
 status text not null default 'pending' check(status in ('pending','approved','rejected','returned')),
 image_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.matches (
 lost_item_id uuid not null references public.items(id) on delete cascade,
 found_item_id uuid not null references public.items(id) on delete cascade,
 score integer not null check(score between 0 and 100), reasons jsonb not null,
 primary key(lost_item_id,found_item_id), check(lost_item_id<>found_item_id)
);
create table public.claims (
 id uuid primary key default gen_random_uuid(), claimant_id uuid not null references public.profiles(id),
 lost_item_id uuid not null references public.items(id), found_item_id uuid not null references public.items(id),
 evidence text not null check(length(trim(evidence)) between 10 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','returned')),
 admin_note text not null default '' check(length(admin_note)<=500),
 reviewed_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(claimant_id,lost_item_id,found_item_id), check(lost_item_id<>found_item_id)
);
create index items_owner on public.items(owner_id);
create index items_status_type on public.items(status,type);
create index claims_lost on public.claims(lost_item_id);
create index claims_found on public.claims(found_item_id);
create index claims_owner on public.claims(claimant_id);
create index matches_found on public.matches(found_item_id);
create unique index one_return_per_found on public.claims(found_item_id) where status='returned';
create unique index one_return_per_lost on public.claims(lost_item_id) where status='returned';

create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name,role) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),80),''),'Ученик'),'student');
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();
create function private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.school_members m on m.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null)
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member() and exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.matches enable row level security;
alter table public.claims enable row level security;
revoke all on public.profiles,public.items,public.matches,public.claims from anon,authenticated;
grant select on public.profiles,public.items,public.matches,public.claims to authenticated;
create policy profile_read on public.profiles for select to authenticated using (private.is_member() and (id=(select auth.uid()) or private.is_admin()));
create policy item_read on public.items for select to authenticated using (private.is_member() and (status in ('approved','returned') or owner_id=(select auth.uid()) or private.is_admin()));
create policy match_read on public.matches for select to authenticated using (private.is_member() and exists(select 1 from public.items where id=lost_item_id and status='approved') and exists(select 1 from public.items where id=found_item_id and status='approved'));
create policy claim_read on public.claims for select to authenticated using (private.is_member() and (claimant_id=(select auth.uid()) or private.is_admin()));

-- Derived cache, never client writable. The API uses the shared TypeScript algorithm
-- for explanations; parity tests keep this persisted score consistent with it.
create function private.match_attributes(a public.items,b public.items) returns jsonb language plpgsql immutable set search_path='' as $$
declare score integer:=0; reasons jsonb:='[]';
begin
 if a.id=b.id or a.type=b.type then return jsonb_build_object('score',0,'reasons',reasons); end if;
 if a.category=b.category then score=score+30; reasons=reasons||jsonb_build_array('Категория: +30'); end if;
 if translate(lower(trim(a.color)),'ё','е')=translate(lower(trim(b.color)),'ё','е') and trim(a.color)<>'' then score=score+20; reasons=reasons||jsonb_build_array('Цвет: +20'); end if;
 if translate(lower(trim(a.location)),'ё','е')=translate(lower(trim(b.location)),'ё','е') and trim(a.location)<>'' then score=score+20; reasons=reasons||jsonb_build_array('Место: +20'); end if;
 if abs(a.date-b.date)<=3 then score=score+15; reasons=reasons||jsonb_build_array('Даты в пределах 3 дней: +15'); end if;
 if exists(select 1 from regexp_split_to_table(translate(lower(a.description),'ё','е'),'[^[:alnum:]]+') wa join regexp_split_to_table(translate(lower(b.description),'ё','е'),'[^[:alnum:]]+') wb on wa=wb where length(wa)>=4 and wa not in ('после','перед','около','найден','найдена','потерян','потеряна','вещь','этот','была','были')) then score=score+15; reasons=reasons||jsonb_build_array('Общие слова в описании: +15'); end if;
 return jsonb_build_object('score',score,'reasons',reasons);
end $$;
create function private.refresh_matches() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.matches where lost_item_id=new.id or found_item_id=new.id;
 if new.status='approved' then
  insert into public.matches(lost_item_id,found_item_id,score,reasons)
  select case when new.type='lost' then new.id else i.id end,case when new.type='found' then new.id else i.id end,(m.attributes->>'score')::integer,m.attributes->'reasons'
  from public.items i cross join lateral (select private.match_attributes(new,i) attributes) m
  where i.status='approved' and i.type<>new.type and (m.attributes->>'score')::integer>=40
  on conflict(lost_item_id,found_item_id) do update set score=excluded.score,reasons=excluded.reasons;
 end if;
 return new;
end $$;
create trigger refresh_item_matches after insert or update on public.items for each row execute function private.refresh_matches();

create function private.save_item(p_id uuid,p_input jsonb) returns public.items language plpgsql security definer set search_path='' as $$
declare result public.items; merged jsonb;
begin
 if not private.is_member() then raise insufficient_privilege using message='School membership required'; end if;
 perform pg_advisory_xact_lock(7102026);
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('type','title','category','color','location','date','description')) then raise check_violation using message='Invalid fields'; end if;
 if p_id is null then
  insert into public.items(owner_id,type,title,category,color,location,date,description) values(auth.uid(),p_input->>'type',trim(p_input->>'title'),p_input->>'category',p_input->>'color',p_input->>'location',(p_input->>'date')::date,trim(p_input->>'description')) returning * into result;
 else
  select * into result from public.items where id=p_id for update;
  if not found then raise no_data_found; end if;
  if result.owner_id<>auth.uid() then raise insufficient_privilege using message='Owner required'; end if;
  if result.status='returned' then raise exception 'Already returned'; end if;
  if exists(select 1 from public.claims where (lost_item_id=p_id or found_item_id=p_id) and status='approved') then raise exception 'Approved claim locks this item'; end if;
  merged=to_jsonb(result)||p_input;
  update public.items set type=merged->>'type',title=trim(merged->>'title'),category=merged->>'category',color=merged->>'color',location=merged->>'location',date=(merged->>'date')::date,description=trim(merged->>'description'),status='pending',updated_at=now() where id=p_id returning * into result;
 end if;
 return result;
end $$;
create function private.moderate_item(p_id uuid,p_status text) returns public.items language plpgsql security definer set search_path='' as $$
declare result public.items;
begin
 if not private.is_admin() then raise insufficient_privilege using message='Admin required'; end if;
 perform pg_advisory_xact_lock(7102026);
 if p_status not in ('approved','rejected') or p_status is null then raise check_violation; end if;
 select * into result from public.items where id=p_id for update;
 if not found then raise no_data_found; end if;
 if result.status='returned' then raise exception 'Already returned'; end if;
 if exists(select 1 from public.claims where (lost_item_id=p_id or found_item_id=p_id) and status='approved') then raise exception 'Approved claim locks this item'; end if;
 update public.items set status=p_status,updated_at=now() where id=p_id returning * into result;
 return result;
end $$;
create function private.submit_claim(p_lost uuid,p_found uuid,p_evidence text) returns public.claims language plpgsql security definer set search_path='' as $$
declare lost public.items; found_item public.items; result public.claims;
begin
 if not private.is_member() then raise insufficient_privilege using message='Member required'; end if;
 perform pg_advisory_xact_lock(7102026);
 -- All workflows lock item ids in a consistent order, then claims, to avoid deadlocks.
 perform 1 from public.items where id in(p_lost,p_found) order by id for update;
 select * into lost from public.items where id=p_lost;
 select * into found_item from public.items where id=p_found;
 if lost.id is null or found_item.id is null or lost.owner_id<>auth.uid() or found_item.owner_id=auth.uid() then raise insufficient_privilege; end if;
 if lost.type<>'lost' or found_item.type<>'found' or lost.status<>'approved' or found_item.status<>'approved' then raise exception 'Items unavailable'; end if;
 insert into public.claims(claimant_id,lost_item_id,found_item_id,evidence) values(auth.uid(),p_lost,p_found,trim(p_evidence)) returning * into result;
 return result;
end $$;
create function private.review_claim(p_id uuid,p_status text,p_note text) returns public.claims language plpgsql security definer set search_path='' as $$
declare result public.claims; initial public.claims;
begin
 if not private.is_admin() then raise insufficient_privilege using message='Admin required'; end if;
 perform pg_advisory_xact_lock(7102026);
 select * into initial from public.claims where id=p_id;
 if not found then raise no_data_found; end if;
 perform 1 from public.items where id in(initial.lost_item_id,initial.found_item_id) order by id for update;
 select * into result from public.claims where id=p_id for update;
 if not ((result.status='pending' and p_status in('approved','rejected')) or (result.status='approved' and p_status in('returned','rejected'))) or p_status is null then raise exception 'Invalid transition'; end if;
 if p_status in('approved','returned') and (select count(*) from public.items where id in(result.lost_item_id,result.found_item_id) and status='approved')<>2 then raise exception 'Items unavailable'; end if;
 if p_status in('approved','returned') and not exists(select 1 from public.items l join public.items f on f.id=result.found_item_id where l.id=result.lost_item_id and l.type='lost' and f.type='found' and l.owner_id=result.claimant_id and f.owner_id<>result.claimant_id) then raise exception 'Invalid pair'; end if;
 if p_status='approved' and exists(select 1 from public.claims where id<>p_id and status='approved' and (lost_item_id=result.lost_item_id or found_item_id=result.found_item_id)) then raise exception 'Competing approved claim'; end if;
 update public.claims set status=p_status,admin_note=coalesce(p_note,''),reviewed_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
 if p_status='returned' then
  update public.items set status='returned',updated_at=now() where id in(result.lost_item_id,result.found_item_id);
  update public.claims set status='rejected',admin_note='Вещь возвращена по другой заявке',reviewed_by=auth.uid(),updated_at=now() where id<>p_id and status in('pending','approved') and (lost_item_id=result.lost_item_id or found_item_id=result.found_item_id);
 end if;
 return result;
end $$;
create function private.admin_stats() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise insufficient_privilege; end if;
 return jsonb_build_object('lost',(select count(*) from public.items where type='lost' and status='approved'),'found',(select count(*) from public.items where type='found' and status='approved'),'pending',(select count(*) from public.items where status='pending'),'returned',(select count(*) from public.claims where status='returned'),'claims',(select count(*) from public.claims where status='pending'));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('item-images','item-images',false,5242880,array['image/jpeg','image/png','image/webp']);
-- No overwrite policy: immutable paths prevent an approved image being silently replaced.
-- No client INSERT/UPDATE policy. Only the backend storage client writes sanitized
-- images using a server-only secret key, after user authentication and ownership checks.
create policy image_read on storage.objects for select to authenticated using(bucket_id='item-images' and private.is_member() and (split_part(name,'/',1)=(select auth.uid())::text or exists(select 1 from public.items where image_path=name)));
create policy image_cleanup on storage.objects for delete to authenticated using(bucket_id='item-images' and split_part(name,'/',1)=(select auth.uid())::text and not exists(select 1 from public.items where image_path=name));
create function private.attach_image(p_id uuid,p_path text) returns public.items language plpgsql security definer set search_path='' as $$
declare result public.items;
begin
 if not private.is_member() then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(7102026);
 select * into result from public.items where id=p_id for update;
 if not found then raise no_data_found; end if;
 if result.owner_id<>auth.uid() or split_part(p_path,'/',1)<>auth.uid()::text or split_part(p_path,'/',2)<>p_id::text then raise insufficient_privilege; end if;
 if result.status='returned' or exists(select 1 from public.claims where (lost_item_id=p_id or found_item_id=p_id) and status='approved') then raise exception 'Item locked'; end if;
 if not exists(select 1 from storage.objects where bucket_id='item-images' and name=p_path) then raise check_violation using message='Image missing'; end if;
 update public.items set image_path=p_path,status='pending',updated_at=now() where id=p_id returning * into result;
 return result;
end $$;

-- Invoker wrappers expose only explicitly authorized operations to PostgREST.
create function public.save_item(p_id uuid,p_input jsonb) returns public.items language sql security invoker set search_path='' as $$ select private.save_item(p_id,p_input) $$;
create function public.moderate_item(p_id uuid,p_status text) returns public.items language sql security invoker set search_path='' as $$ select private.moderate_item(p_id,p_status) $$;
create function public.submit_claim(p_lost uuid,p_found uuid,p_evidence text) returns public.claims language sql security invoker set search_path='' as $$ select private.submit_claim(p_lost,p_found,p_evidence) $$;
create function public.review_claim(p_id uuid,p_status text,p_note text) returns public.claims language sql security invoker set search_path='' as $$ select private.review_claim(p_id,p_status,p_note) $$;
create function public.admin_stats() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_stats() $$;
create function public.attach_image(p_id uuid,p_path text) returns public.items language sql security invoker set search_path='' as $$ select private.attach_image(p_id,p_path) $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(),private.is_admin(),private.save_item(uuid,jsonb),private.moderate_item(uuid,text),private.submit_claim(uuid,uuid,text),private.review_claim(uuid,text,text),private.admin_stats(),private.attach_image(uuid,text) to authenticated;
revoke all on function public.save_item(uuid,jsonb),public.moderate_item(uuid,text),public.submit_claim(uuid,uuid,text),public.review_claim(uuid,text,text),public.admin_stats(),public.attach_image(uuid,text) from public,anon,authenticated;
grant execute on function public.save_item(uuid,jsonb),public.moderate_item(uuid,text),public.submit_claim(uuid,uuid,text),public.review_claim(uuid,text,text),public.admin_stats(),public.attach_image(uuid,text) to authenticated;
