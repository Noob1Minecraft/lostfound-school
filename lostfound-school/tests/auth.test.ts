import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeAuthenticator } from '../server/store.ts'
const id='11111111-1111-4111-8111-111111111111'
test('auth verifies user with Supabase and ignores client-editable admin metadata',async t=>{
 const calls:string[]=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);calls.push(url)
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer supplied-token')
  return Response.json(url.includes('/auth/v1/user')?{id,email:'a@school.test',email_confirmed_at:'2026-11-10',user_metadata:{role:'admin'}}:{id,display_name:'Student',role:'student'})
 })
 const context=await makeAuthenticator('https://school.supabase.co','publishable')('supplied-token')
 assert.equal(context?.profile.role,'student');assert.ok(calls[0].endsWith('/auth/v1/user'));assert.ok(calls[1].includes('/rest/v1/profiles'))
})
test('unverified and anonymous users cannot obtain a school context',async t=>{
 for(const user of [{id,email:'a@school.test'},{id,email_confirmed_at:'2026-11-10',is_anonymous:true}]){
  const mock=t.mock.method(globalThis,'fetch',async()=>Response.json(user))
  assert.equal(await makeAuthenticator('https://school.supabase.co','publishable')('token'),null)
  mock.mock.restore()
 }
})
test('invalid access tokens are rejected',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({message:'Invalid token'},{status:401}))
 assert.equal(await makeAuthenticator('https://school.supabase.co','publishable')('bad-token'),null)
})
test('verified outsiders are rejected when membership RLS hides their profile',async t=>{
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>Response.json(String(input).includes('/auth/v1/user')?{id,email_confirmed_at:'2026-11-10'}:null))
 await assert.rejects(makeAuthenticator('https://school.supabase.co','publishable')('token'),/Доступ к школе/)
})
