// Deliberately excluded from npm test. Requires an explicitly authorized empty Preview.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import type {Item,Claim,Match,Profile} from '../shared/domain.ts'
const env=process.env
function settings(){
 if(env.RUN_NEON_PREVIEW_TESTS!=='yes'||env.APP_ENV!=='preview')throw new Error('Set APP_ENV=preview and RUN_NEON_PREVIEW_TESTS=yes for an authorized synthetic-data Preview only')
 const origin=new URL(env.NEON_PREVIEW_ORIGIN||'')
 if(origin.protocol!=='https:'||origin.origin!==env.NEON_PREVIEW_ORIGIN||origin.hostname==='lostfound-school.vercel.app'||!origin.hostname.endsWith('.vercel.app')||origin.hostname!==env.NEON_PREVIEW_EXPECTED_HOST)throw new Error('Explicit non-production Preview hostname required')
 for(const role of ['A','B','ADMIN'])for(const field of ['EMAIL','PASSWORD'])if(!env[`NEON_TEST_${role}_${field}`])throw new Error(`NEON_TEST_${role}_${field} required`)
 return origin.origin
}
function client(origin:string){
 const cookies=new Map<string,string>()
 async function call<T>(path:string,method='GET',body?:object|FormData,expected=200):Promise<T>{
  const headers=new Headers({Origin:origin})
  if(cookies.size)headers.set('Cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '))
  if(body&&!(body instanceof FormData))headers.set('Content-Type','application/json')
  const response=await fetch(origin+'/api'+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(25000)})
  assert.equal(response.status,expected,`Unexpected status for ${method} ${path}`)
  assert.match(response.headers.get('cache-control')||'',/no-store/)
  assert.match(response.headers.get('content-type')||'',/application\/json/)
  for(const raw of response.headers.getSetCookie()){const pair=raw.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1))}
  return await response.json() as T
 }
 return {call,async login(role:string){await call('/auth/sign-in/email','POST',{email:env[`NEON_TEST_${role}_EMAIL`],password:env[`NEON_TEST_${role}_PASSWORD`]});const session=await call('/auth/get-session');assert.ok(session,'Verify test email before running the workflow');return call<Profile>('/me')}}
}
test('authorized Preview: two real users, private images, Smart Match, admin return and persistent reload',async()=>{
 const origin=settings(),a=client(origin),b=client(origin),admin=client(origin),anonymous=client(origin)
 const pa=await a.login('A');await b.login('B');const staff=await admin.login('ADMIN')
 assert.equal(pa.role,'student');assert.equal(staff.role,'admin')
 await anonymous.call('/items','GET',undefined,401)
 await a.call('/admin/members','GET',undefined,403)
 const input={type:'lost',title:'Preview integration notebook',category:'Школьные принадлежности',color:'Синий',location:'Библиотека',date:new Date().toISOString().slice(0,10),description:'Synthetic preview notebook star sticker identifier'}
 const lost=await a.call<Item>('/items','POST',input),found=await b.call<Item>('/items','POST',{...input,type:'found'})
 await b.call(`/items/${lost.id}`,'PATCH',{title:'Unauthorized edit'},404)
 await a.call('/items','POST',{...input,owner_id:staff.id,role:'admin'},400)
 const bytes=await sharp({create:{width:20,height:20,channels:3,background:'blue'}}).png().toBuffer()
 const form=new FormData();form.set('image',new Blob([new Uint8Array(bytes)],{type:'image/png'}),'synthetic.png')
 const image=await a.call<Item>(`/items/${lost.id}/image`,'POST',form)
 assert.ok(image.image_url,'Signed image URL required')
 const imageResponse=await fetch(image.image_url!,{signal:AbortSignal.timeout(15000)})
 assert.equal(imageResponse.status,200);assert.match(imageResponse.headers.get('content-type')||'',/image\/webp/)
 const unsigned=new URL(image.image_url!);unsigned.search=''
 assert.ok([401,403,404].includes((await fetch(unsigned,{signal:AbortSignal.timeout(15000)})).status),'Bucket must remain private')
 for(const item of [lost,found])await admin.call(`/admin/items/${item.id}`,'PATCH',{status:'approved'})
 const matches=await a.call<Match[]>('/matches');assert.ok(matches.some(m=>m.a.id===lost.id&&m.b.id===found.id))
 const claim=await a.call<Claim>('/claims','POST',{lost_item_id:lost.id,found_item_id:found.id,evidence:'Synthetic ownership evidence for Preview verification'})
 assert.ok(!(await b.call<Claim[]>('/claims')).some(c=>c.id===claim.id),'Claim evidence must remain private')
 await admin.call(`/admin/claims/${claim.id}`,'PATCH',{status:'approved',admin_note:'Synthetic review'})
 await admin.call(`/admin/claims/${claim.id}`,'PATCH',{status:'returned',admin_note:'Synthetic handoff verified'})
 await a.call('/auth/sign-out','POST',{})
 const reloaded=client(origin);await reloaded.login('A')
 for(const item of [lost,found])assert.equal((await reloaded.call<Item>(`/items/${item.id}`)).status,'returned')
 assert.equal((await reloaded.call<Claim[]>('/claims')).find(c=>c.id===claim.id)?.status,'returned')
 for(const c of [reloaded,b,admin])await c.call('/auth/sign-out','POST',{})
})
