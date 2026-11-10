import { test } from 'node:test'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { createApp } from '../server/app.ts'
import { makeAuthenticator } from '../server/store.ts'
import type { Claim, Item, Match, Profile } from '../shared/domain.ts'
import { ensure, login, stagingConfig } from './support.ts'

test('live staging Auth → listings → private images → matches → verified return', {timeout:180000},async()=>{
 const config=stagingConfig()
 const accounts=await Promise.all(['STAGING_STUDENT_A','STAGING_STUDENT_B','STAGING_ADMIN','STAGING_OUTSIDER'].map(name=>login(config.url,config.key,name)))
 const [a,b,admin,outsider]=accounts
 const server=createApp({origin:config.origin,authenticate:makeAuthenticator(config.url,config.key,config.storageKey)}).listen(0,'127.0.0.1')
 await new Promise<void>(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
 async function request<T>(token:string,path:string,method='GET',body?:unknown,expected=200):Promise<T> {
  const headers:Record<string,string>={Authorization:`Bearer ${token}`}
  if(body&&!(body instanceof FormData))headers['Content-Type']='application/json'
  const response=await fetch(base+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)})
  ensure(response.status===expected,`${method} ${path}: unexpected HTTP status ${response.status} (expected ${expected})`)
  return response.json() as Promise<T>
 }
 try {
  ensure((await request<Profile>(a.token,'/me')).role==='student','Student A was incorrectly promoted by registration metadata')
  ensure((await request<Profile>(b.token,'/me')).role==='student','Student B must remain student')
  ensure((await request<Profile>(admin.token,'/me')).role==='admin','Promote the designated staff account in Dashboard SQL first')
  await request(outsider.token,'/me','GET',undefined,403)
  await request(a.token,'/admin/stats','GET',undefined,403)
  const denied=await a.db.from('profiles').update({role:'admin'}).eq('id',a.id)
  ensure(Boolean(denied.error),'Direct profile role escalation was not rejected')
  const outsiderRows=await outsider.db.from('items').select('id')
  ensure(!outsiderRows.error&&outsiderRows.data.length===0,'Outsider can read school listings')
  const run=crypto.randomUUID().slice(0,8)
  const input={type:'lost',title:`Staging ${run}`,category:'Электроника',color:'Чёрный',location:'Библиотека',date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Qyzylorda'}),description:`Проверочные наушники чехол ${run}`}
  const lost=await request<Item>(a.token,'/items','POST',input,201)
  const found=await request<Item>(b.token,'/items','POST',{...input,type:'found'},201)
  ensure(lost.status==='pending'&&found.status==='pending','New listings must await moderation')
  const hidden=await b.db.from('items').select('id').eq('id',lost.id)
  ensure(!hidden.error&&hidden.data.length===0,'Another student sees an unmoderated listing')
  const raw=await b.db.rpc('save_item',{p_id:lost.id,p_input:{title:'Unauthorized edit'}})
  ensure(Boolean(raw.error),'Direct RPC ownership enforcement failed')
  const png=await sharp({create:{width:32,height:32,channels:3,background:'#6258e8'}}).png().toBuffer()
  const direct=await b.db.storage.from('item-images').upload(`${b.id}/${found.id}/raw.png`,png,{contentType:'image/png'})
  ensure(Boolean(direct.error),'Direct raw Storage upload was not rejected')
  const form=new FormData();form.append('image',new Blob([new Uint8Array(png)],{type:'image/png'}),'fixture.png')
  const image=await request<Item>(b.token,`/items/${found.id}/image`,'POST',form)
  ensure(image.image_path?.endsWith('.webp')&&image.image_url,'Sanitized image/path missing')
  const url=new URL(image.image_url);ensure(url.origin===new URL(config.url).origin,'Unexpected signed image host')
  const imageResponse=await fetch(url,{signal:AbortSignal.timeout(20000)})
  ensure(imageResponse.ok,'Signed image download failed')
  const metadata=await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata()
  ensure(metadata.format==='webp'&&!metadata.exif,'Uploaded image was not sanitized WebP')
  const privateLink=await a.db.storage.from('item-images').createSignedUrl(image.image_path!,60)
  ensure(Boolean(privateLink.error),'Unmoderated image is visible to another student')
  await request(admin.token,`/admin/items/${lost.id}`,'PATCH',{status:'approved'})
  await request(admin.token,`/admin/items/${found.id}`,'PATCH',{status:'approved'})
  const matches=await request<Match[]>(a.token,'/matches')
  const pair=matches.find(x=>x.a.id===lost.id&&x.b.id===found.id)
  ensure(pair?.score===100&&pair.reasons.length===5,'Smart Match did not produce explained full-score pair')
  const persisted=await a.db.from('matches').select('score').eq('lost_item_id',lost.id).eq('found_item_id',found.id).single()
  ensure(!persisted.error&&persisted.data.score===100,'Persisted match differs from API match')
  const claim=await request<Claim>(a.token,'/claims','POST',{lost_item_id:lost.id,found_item_id:found.id,evidence:`Synthetic verification evidence ${run}`},201)
  const privateClaim=await b.db.from('claims').select('id').eq('id',claim.id)
  ensure(!privateClaim.error&&privateClaim.data.length===0,'Finder can read claimant private evidence')
  await request(a.token,`/admin/claims/${claim.id}`,'PATCH',{status:'returned'},403)
  await request(admin.token,`/admin/claims/${claim.id}`,'PATCH',{status:'approved',admin_note:'Synthetic staging verification'})
  await request(admin.token,`/admin/claims/${claim.id}`,'PATCH',{status:'returned',admin_note:'Synthetic staging return — no real item'})
  for(const id of [lost.id,found.id])ensure((await request<Item>(a.token,`/items/${id}`)).status==='returned','Return did not close both listings')
  await request(a.token,`/items/${lost.id}`,'PATCH',{title:'Cannot reopen'},409)
  console.log('Live staging workflow passed. Synthetic returned listings are retained for inspection; no production resources were used by this configured test run.')
 } finally {
  await Promise.allSettled(accounts.map(x=>x.db.auth.signOut()))
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(new Error('Local test server shutdown failed')):resolve()))
 }
})
