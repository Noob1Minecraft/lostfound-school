import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222', admin='33333333-3333-4333-8333-333333333333', outsider='44444444-4444-4444-8444-444444444444'
const input={type:'lost',title:'Наушники',category:'Электроника',color:'Чёрный',location:'Библиотека',date:'2026-11-10',description:'Наушники в чехле'}
test('database RLS, role protection and complete two-student return workflow', async()=> {
 const db=new PGlite()
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
 grant usage on schema auth,storage to authenticated; grant execute on function auth.uid() to authenticated; grant select,insert,delete on storage.objects to authenticated;`)
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[outsider,'outsider@test.test',{role:'admin'}])
 for (const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 assert.equal((await db.query<{role:string}>('select role from profiles where id=$1',[outsider])).rows[0]?.role,'student')
 for(const [id,email] of [[a,'a@school.test'],[b,'b@school.test'],[admin,'admin@school.test']]) await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[id,email,{role:'admin',display_name:'Student'}])
 await db.exec(`insert into private.school_members(email) values ('a@school.test'),('b@school.test'),('admin@school.test'); update public.profiles set role='admin' where id='${admin}';`)
 async function as(id:string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated') }
 async function rpc<T>(sql:string,params:unknown[]=[]) { return (await db.query<{result:T}>(`select to_jsonb(${sql}) as result`,params)).rows[0].result }
 await as(a)
 for(let i=0;i<20;i++) assert.equal(await rpc<boolean>("consume_api_rate_limit('write')"),true)
 assert.equal(await rpc<boolean>("consume_api_rate_limit('write')"),false)
 assert.equal(await rpc<boolean>("consume_api_rate_limit('read')"),true)
 for(let i=1;i<120;i++) assert.equal(await rpc<boolean>("consume_api_rate_limit('read')"),true)
 assert.equal(await rpc<boolean>("consume_api_rate_limit('read')"),false)
 await db.exec("reset role; update private.api_rate_limits set window_start=now()-interval '2 minutes'")
 await as(a); assert.equal(await rpc<boolean>("consume_api_rate_limit('write')"),true)
 await assert.rejects(db.exec('select * from private.api_rate_limits'),/permission denied/)
 await assert.rejects(rpc("consume_api_rate_limit('arbitrary')"),/scope/)
 await as(b); assert.equal(await rpc<boolean>("consume_api_rate_limit('write')"),true)
 await as(outsider); await assert.rejects(rpc("consume_api_rate_limit('write')"),/permission|member/i)
 await db.exec('reset role; set role anon')
 await assert.rejects(rpc("consume_api_rate_limit('read')"),/permission denied/)
 await as(a)
 assert.equal((await db.query<{role:string}>('select role from profiles')).rows[0].role,'student')
 await assert.rejects(db.exec("update profiles set role='admin'"), /permission denied/)
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('item-images',$1)",[a+'/untrusted.webp']),/row-level security/)
 const lost=await rpc<{id:string;status:string}>('save_item(null,$1)',[input]); assert.equal(lost.status,'pending')
 await as(b); assert.equal((await db.query('select * from items')).rows.length,0)
 await assert.rejects(rpc('save_item($1,$2)',[lost.id,{title:'Hijacked'}]),/permission|owner/i)
 const found=await rpc<{id:string}>('save_item(null,$1)',[{...input,type:'found'}])
 await assert.rejects(rpc('moderate_item($1,$2)',[found.id,'approved']),/permission|admin/i)
 await as(admin); await rpc('moderate_item($1,$2)',[lost.id,'approved']); await rpc('moderate_item($1,$2)',[found.id,'approved'])
 await as(outsider); assert.equal((await db.query('select * from items')).rows.length,0); await assert.rejects(rpc('save_item(null,$1)',[input]),/permission|member/i)
 await as(a); assert.equal((await db.query('select * from items')).rows.length,2)
 assert.equal((await db.query<{score:number}>('select score from matches')).rows[0].score,100)
 await assert.rejects(db.exec('delete from matches'),/permission denied/)
 const claim=await rpc<{id:string}>('submit_claim($1,$2,$3)',[lost.id,found.id,'Внутри чехла есть наклейка'])
 await assert.rejects(rpc('submit_claim($1,$2,$3)',[lost.id,found.id,'Повторная заявка с доказательством']),/duplicate/i)
 await rpc('save_item($1,$2)',[lost.id,{type:'found'}])
 await as(admin); await rpc('moderate_item($1,$2)',[lost.id,'approved'])
 await assert.rejects(rpc('review_claim($1,$2,$3)',[claim.id,'approved','']),/Items unavailable|Invalid pair/i)
 await as(a); await rpc('save_item($1,$2)',[lost.id,{type:'lost'}])
 await as(admin); await rpc('moderate_item($1,$2)',[lost.id,'approved'])
 await as(b); assert.equal((await db.query('select * from claims')).rows.length,0)
 await assert.rejects(rpc('review_claim($1,$2,$3)',[claim.id,'returned','']),/permission|admin/i)
 await as(admin); await assert.rejects(rpc('review_claim($1,$2,$3)',[claim.id,'returned','']),/transition/i)
 await rpc('review_claim($1,$2,$3)',[claim.id,'approved','Проверено'])
 await rpc('review_claim($1,$2,$3)',[claim.id,'returned','Передано лично'])
 assert.deepEqual((await db.query<{status:string}>('select status from items')).rows.map(x=>x.status),['returned','returned'])
 assert.equal((await db.query('select * from matches')).rows.length,0)
 await assert.rejects(rpc('review_claim($1,$2,$3)',[claim.id,'returned','']),/transition/i)
 await as(a); await assert.rejects(rpc('save_item($1,$2)',[lost.id,{title:'Изменено'}]),/returned/i)
 await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[a]);await as(a)
 assert.equal((await db.query('select * from items')).rows.length,0)
 await assert.rejects(rpc('save_item(null,$1)',[input]),/membership/i)
 await db.exec('reset role');await db.query('update auth.users set banned_until=null,is_anonymous=true where id=$1',[a]);await as(a)
 assert.equal((await db.query('select * from items')).rows.length,0)
 await db.exec('reset role');await db.query('update auth.users set is_anonymous=false,deleted_at=now() where id=$1',[a]);await as(a)
 assert.equal((await db.query('select * from items')).rows.length,0)
 await db.exec('reset role')
 await db.query("insert into storage.objects(bucket_id,name) values('item-images',$1)",[b+'/orphan.webp'])
 await as(b);await db.query('delete from storage.objects where name=$1',[b+'/orphan.webp'])
 await db.exec('reset role');assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 await db.exec(await readFile(new URL('../supabase/migrations/20261110010000_staging_hardening.sql',import.meta.url),'utf8'))
 assert.equal((await db.query<{role:string}>('select role from profiles where id=$1',[admin])).rows[0].role,'admin')
 } finally { await db.close() }
})
