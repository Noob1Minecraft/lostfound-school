import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { supabaseStore } from '../server/store.ts'
test('claims beyond PostgREST page size remain visible',async t=>{
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
  const url=new URL(String(input)),offset=Number(url.searchParams.get('offset')??0)
  return Response.json(Array.from({length:offset===0?500:1},(_,i)=>({id:`claim-${offset+i}`,status:'pending'})))
 })
 const rows=await supabaseStore(createClient('https://school.supabase.co','publishable')).listClaims()
 assert.equal(rows.length,501);assert.equal(rows.at(-1)?.id,'claim-500')
})
test('image upload fails clearly when server storage credentials are absent',async()=>{
 const store=supabaseStore(createClient('https://school.supabase.co','publishable'))
 await assert.rejects(store.upload('item','owner',Buffer.from('image')),/Загрузка фото ещё не настроена/)
})
test('signed URL failures surface without deleting an already attached image',async t=>{
 let deleted=false
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input)
  if(init?.method==='DELETE'){deleted=true;return Response.json([])}
  if(url.includes('/rpc/attach_image'))return Response.json({id:'item',image_path:'owner/item/image.webp'})
  if(url.includes('/object/sign/'))return Response.json({message:'Storage unavailable'},{status:503})
  return Response.json({Key:'item-images/owner/item/image.webp'})
 })
 const db=createClient('https://school.supabase.co','publishable')
 await assert.rejects(supabaseStore(db,db).upload('item','owner',Buffer.from('image')),/Хранилище/)
 assert.equal(deleted,false)
})
