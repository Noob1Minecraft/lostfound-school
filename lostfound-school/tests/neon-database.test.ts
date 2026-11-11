import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createNeonDatabaseWithPool, type DatabasePool } from '../server/neon-database.ts'
test('mutators recheck membership after acquiring the shared transaction lock',async()=>{
 const sql=await readFile(new URL('../neon/migrations/001_school.sql',import.meta.url),'utf8')
 for(const name of ['save_item','moderate_item','submit_claim','review_claim','attach_image','close_item']){
  const body=sql.split(`create function private.${name}(`)[1].split('end $$;')[0]
  assert.ok(body.indexOf('pg_advisory_xact_lock')<body.indexOf('if not private.is_'),name)
 }
})
const input={type:'lost' as const,title:'Наушники',category:'Электроника' as const,color:'Чёрный',location:'Библиотека',date:'2026-11-10',description:'Наушники в чехле'}
test('Neon real SQL isolation, allowlist, claims, roles and durable reload',async()=>{
 let db=new PGlite()
 try {
 const migration=await readFile(new URL('../neon/migrations/001_school.sql',import.meta.url),'utf8')
 await assert.rejects(db.exec(migration.replace(/commit;\s*$/i,'select 1/0; commit;')),/division by zero/)
 await db.exec('rollback')
 assert.equal((await db.query<{name:string|null}>("select to_regclass('public.profiles')::text as name")).rows[0].name,null)
 assert.equal((await db.query("select 1 from pg_roles where rolname='school_app'")).rows.length,0)
 await db.exec(migration)
 await db.exec(await readFile(new URL('../neon/verify.sql',import.meta.url),'utf8'))
 const pool:DatabasePool={async connect(){return {async query(sql,params){return db.query(sql,params as unknown[])},release(){}}}}
 const api=createNeonDatabaseWithPool(pool)
 await assert.rejects(api.resolveIdentity({id:'outsider',email:'outsider@school.test',name:'Out'}))
 await db.exec("insert into private.school_members(email) values ('a@school.test'),('b@school.test'),('admin@school.test')")
 const a=await api.resolveIdentity({id:'external:a',email:'a@school.test',name:'A'})
 const b=await api.resolveIdentity({id:'external:b',email:'b@school.test',name:'B'})
 let admin=await api.resolveIdentity({id:'external:admin',email:'admin@school.test',name:'Admin'})
 assert.equal(a.role,'student'); assert.notEqual(a.id,'external:a')
 await db.query("update profiles set role='admin' where id=$1",[admin.id])
 admin=await api.resolveIdentity({id:'external:admin',email:'admin@school.test',name:'Admin'})
 const sa=api.store(a),sb=api.store(b),su=api.store(admin)
 const lost=await sa.saveItem(null,input)
 assert.equal((await sb.listItems()).length,0)
 await assert.rejects(sb.saveItem(lost.id,{title:'Hijack'}))
  await assert.rejects(sa.moderate(lost.id,'approved'))
 await assert.rejects(api.store({...a,role:'admin'}).moderate(lost.id,'approved'))
 const objects=new Map<string,Buffer>();const removed:string[]=[]
 const images={async put(path:string,bytes:Buffer){objects.set(path,bytes)},async remove(path:string){removed.push(path);objects.delete(path)},async sign(path:string){return 'https://private.test/'+path}}
 const imageItem=await sa.saveItem(null,input)
 const uploaded=await api.store(a,images).upload(imageItem.id,a.id,Buffer.from('test image'))
 assert.ok(uploaded.image_url?.startsWith('https://private.test/'))
 await assert.rejects(api.store(b,images).upload(imageItem.id,a.id,Buffer.from('wrong owner')))
 const badSign={...images,async sign():Promise<string>{throw new Error('sign unavailable')}}
 await assert.rejects(api.store(a,badSign).upload(imageItem.id,a.id,Buffer.from('new image')),/sign unavailable/)
 assert.equal(removed.length,1)
 assert.equal(objects.size,1)
 await api.store(a,images).closeItem!(imageItem.id)
 await assert.rejects(api.store(a,images).upload(imageItem.id,a.id,Buffer.from('locked')))
 assert.equal(removed.length,2)
 assert.equal(objects.size,1)
 const found=await sb.saveItem(null,{...input,type:'found'})
 await su.moderate(lost.id,'approved');await su.moderate(found.id,'approved')
 const claim=await sa.createClaim({lost_item_id:lost.id,found_item_id:found.id,evidence:'Внутри чехла наклейка'})
 await assert.rejects(sa.createClaim({lost_item_id:lost.id,found_item_id:found.id,evidence:'Внутри чехла наклейка'}))
 assert.equal((await sb.listClaims()).length,0)
 await assert.rejects(su.reviewClaim(claim.id,'returned',''))
 await su.reviewClaim(claim.id,'approved','Checked')
 await assert.rejects(sa.closeItem!(lost.id))
 await su.reviewClaim(claim.id,'returned','Returned')
 assert.equal((await sa.getItem(lost.id))?.status,'returned')
 await assert.rejects(sa.closeItem!(lost.id))
 const closed=await sa.saveItem(null,input);assert.equal((await sa.closeItem!(closed.id)).status,'closed')
 await assert.rejects(sa.saveItem(closed.id,{title:'Reopen'}))
 assert.equal(await sa.consumeRateLimit('write'),true)
 await db.exec('delete from private.api_rate_limits')
 // Evaluate each full budget in one statement so minute rollover cannot reset it mid-test.
 await db.exec('begin; set local role school_app')
 await db.query("select set_config('school.user_id',$1,true)",[a.id])
 for(const [scope,limit] of [['write',20],['read',120]] as const){
  const rows=(await db.query<{allowed:boolean}>('select public.consume_api_rate_limit($1) as allowed from generate_series(1,$2)',[scope,limit+1])).rows
  assert.deepEqual(rows.map(row=>row.allowed),[...Array<boolean>(limit).fill(true),false])
 }
 await db.exec('commit')
 assert.equal(await sb.consumeRateLimit('write'),true)
 await db.exec("update private.api_rate_limits set window_start=now()-interval '2 minutes'")
 assert.equal(await sa.consumeRateLimit('write'),true)
 const reloaded=createNeonDatabaseWithPool(pool)
 assert.equal((await reloaded.store(a).getItem(lost.id))?.status,'returned')
 assert.equal((await db.query<{id:string|null}>("select nullif(current_setting('school.user_id',true),'') as id")).rows[0].id,null)
 await db.exec('set role school_app')
 await assert.rejects(db.exec("update profiles set role='admin'"),/permission denied/)
 await assert.rejects(db.exec("select private.provision_identity('forged','a@school.test','Forged')"),/permission denied/)
 await assert.rejects(db.exec('select * from private.identities'),/permission denied/)
 assert.equal((await db.query('select * from items')).rows.length,0)
 await db.exec('reset role')
 await assert.rejects(sa.manageMember!({email:'a@school.test',role:'admin'}))
 await assert.rejects(su.manageMember!({email:'admin@school.test',role:'student'}))
  await su.manageMember!({email:'b@school.test',active:false})
 const audit=(await db.query<{actor_id:string;target_email:string;before_state:{active:boolean};after_state:{active:boolean}}>('select * from private.member_audit')).rows
 assert.equal(audit.length,1);assert.equal(audit[0].actor_id,admin.id);assert.equal(audit[0].target_email,'b@school.test')
 assert.equal(audit[0].before_state.active,true);assert.equal(audit[0].after_state.active,false)
 await db.exec('set role school_app')
 await assert.rejects(db.exec('delete from private.member_audit'),/permission denied/)
 assert.equal((await db.query('select * from private.member_audit')).rows.length,0)
 await db.exec('reset role')
 assert.equal((await sb.listItems()).length,0)
  await assert.rejects(api.resolveIdentity({id:'external:b',email:'b@school.test',name:'B'}))
 const snapshot=await db.dumpDataDir()
 await db.close()
 db=new PGlite({loadDataDir:snapshot})
 assert.equal((await api.resolveIdentity({id:'external:a',email:'a@school.test',name:'A'})).id,a.id)
 assert.equal((await sa.getItem(lost.id))?.status,'returned')
 assert.equal((await sa.listClaims())[0].status,'returned')
 await assert.rejects(api.resolveIdentity({id:'external:b',email:'b@school.test',name:'B'}))
 }finally{await db.close()}
})






test('request deadline prevents a delayed connection or statement from committing',async()=>{
 const {requestDeadline}=await import('../server/request-context.ts')
 const {EventEmitter}=await import('node:events')
 for(const delayAt of ['connect','statement']){
  const queries:string[]=[]
  const pool:DatabasePool={async connect(){
   if(delayAt==='connect')await new Promise(resolve=>setTimeout(resolve,30))
   return {async query(sql){queries.push(sql);if(sql.includes('pg_roles'))return {rows:[{rolsuper:false,rolbypassrls:false,owns_tables:false}]};if(sql.startsWith('select to_jsonb'))await new Promise(resolve=>setTimeout(resolve,30));return {rows:[{result:{id:'id',display_name:'A',role:'student'}}]}},release(){}}
  }}
  const response=Object.assign(new EventEmitter(),{headersSent:false,writableEnded:false,destroyed:false,status(){return this},json(){return this}})
  const operation=new Promise((resolve,reject)=>requestDeadline(5)({} as never,response as never,()=>{createNeonDatabaseWithPool(pool).resolveIdentity({id:'external',email:'a@test.test'}).then(resolve,reject)}))
  await assert.rejects(operation)
  assert.ok(!queries.includes('COMMIT'))
  if(delayAt==='connect')assert.ok(!queries.includes('BEGIN'))
  else assert.ok(queries.includes('ROLLBACK'))
 }
})
