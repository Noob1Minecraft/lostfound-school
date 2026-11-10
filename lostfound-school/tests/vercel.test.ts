import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp, type AuthContext } from '../server/app.ts'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const origin = 'https://school.example'
const id = '11111111-1111-4111-8111-111111111111'
const profile = { id, role: 'student' as const, display_name: 'Student' }

test('API successes, errors and CORS rejections are never cached', async () => {
 const app = createApp({ origin, authenticate: async () => null })
 for (const path of ['/api/health', '/api/me', '/api/missing']) {
  const res = await request(app).get(path)
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0')
  assert.equal(res.headers['vercel-cdn-cache-control'], 'no-store')
 }
 const res = await request(app).get('/api/me').set('Origin', 'https://other.example')
 assert.equal(res.status, 403); assert.match(res.headers['cache-control'], /no-store/)
})

test('Vercel adapter fails closed without configuration and exposes no values', async () => {
 const { createVercelApp } = await import('../server/vercel.ts')
 const app = createVercelApp({ SUPABASE_STORAGE_SECRET_KEY: 'sensitive-fixture' })
 for (const path of ['/api/health', '/api/me', '/api/items', '/api/admin/stats']) {
  const res = await request(app).get(path)
  assert.equal(res.status, 503); assert.match(res.headers['content-type'], /json/)
  assert.ok(!res.text.includes('sensitive-fixture')); assert.match(res.headers['cache-control'], /no-store/)
 }
})

test('deadline aborts authentication before routes execute and safely sends 504', async () => {
 const app = createApp({ origin, requestTimeoutMs: 25, authenticate: async () => {
  await new Promise(resolve => setTimeout(resolve, 70)); return null
 } })
 const res = await request(app).get('/api/me').set('Authorization', 'Bearer fixture')
 assert.equal(res.status, 504); assert.match(res.headers['cache-control'], /no-store/)
 await new Promise(resolve => setTimeout(resolve, 90))
})

test('distributed limiter is required, isolates read/write budgets and fails closed', async () => {
 const calls: string[] = []
 const auth = { profile, store: { consumeRateLimit: async (scope: string) => { calls.push(scope); return false } } } as unknown as AuthContext
 const app = createApp({ origin, distributedRateLimit: true, authenticate: async () => auth })
 const res = await request(app).get('/api/me').set('Authorization', 'Bearer fixture')
 assert.equal(res.status, 429); assert.equal(res.headers['retry-after'], '60'); assert.deepEqual(calls, ['read'])
 const broken = createApp({ origin, distributedRateLimit: true, authenticate: async () => ({ profile, store: {} } as AuthContext) })
 assert.equal((await request(broken).get('/api/me').set('Authorization', 'Bearer fixture')).status, 503)
})

test('valid images are sanitized to WebP; files above 4 MB are rejected', async () => {
 let uploaded: Buffer | undefined
 const auth = { profile, store: { getItem: async () => ({ id, owner_id: id }), upload: async (_id: string, _owner: string, bytes: Buffer) => { uploaded = bytes; return { id } } } } as unknown as AuthContext
 const app = createApp({ origin, authenticate: async () => auth })
 const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).png().toBuffer()
 const good = await request(app).post(`/api/items/${id}/image`).set('Authorization', 'Bearer fixture').attach('image', png, { filename: 'item.png', contentType: 'image/png' })
 assert.equal(good.status, 200); assert.equal((await sharp(uploaded!).metadata()).format, 'webp')
 const big = await request(app).post(`/api/items/${id}/image`).set('Authorization', 'Bearer fixture').attach('image', Buffer.alloc(4_000_001), { filename: 'big.jpg', contentType: 'image/jpeg' })
 assert.equal(big.status, 400); assert.match(big.body.error, /4 МБ/)
})

test('routing keeps all API paths away from SPA fallback and preserves frontend routes', async () => {
 const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
 assert.deepEqual(config.rewrites[0], { source: '/api/:path*', destination: '/api' })
 const spa = new RegExp('^' + config.rewrites[1].source + '$')
 for (const path of ['/api', '/api/me', '/api/items/123/image', '/assets/app.js']) assert.equal(spa.test(path), false)
 for (const path of ['/', '/login', '/reset-password', '/app/items/123']) assert.equal(spa.test(path), true)
 assert.equal(config.functions['api/index.ts'].maxDuration, 30)
})

test('configured adapter preserves routes, JWT authorization, CORS and safe unknown-route errors', async t => {
 const { createVercelApp } = await import('../server/vercel.ts')
 const calls: string[] = []
 let limiterFails=false
 t.mock.method(globalThis,'fetch',async (input: RequestInfo | URL, init?: RequestInit) => {
  const url=String(input); calls.push(url)
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer user-fixture')
  assert.ok(init?.signal)
  if(url.includes('/auth/v1/user')) return Response.json({id,email_confirmed_at:'2026-11-10',user_metadata:{role:'admin'}})
  if(url.includes('/profiles')) return Response.json(profile)
  if(url.includes('/consume_api_rate_limit')) return limiterFails ? Response.json({message:'sensitive diagnostic'},{status:503}) : Response.json(true)
  if(url.includes('/items')) return Response.json([])
  throw new Error('Unexpected test URL')
 })
 const app=createVercelApp({SUPABASE_URL:'https://school.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',FRONTEND_ORIGIN:origin})
 assert.equal((await request(app).get('/api/health')).status,200)
 assert.equal((await request(app).get('/api/me')).status,401)
 assert.deepEqual((await request(app).get('/api/me').set('Authorization','Bearer user-fixture')).body,profile)
 assert.deepEqual((await request(app).get('/api/items?search=bag').set('Authorization','Bearer user-fixture')).body,[])
 assert.equal((await request(app).get('/api/admin/stats').set('Authorization','Bearer user-fixture')).status,403)
 const missing=await request(app).get('/api/not-a-route').set('Authorization','Bearer user-fixture')
 assert.equal(missing.status,404); assert.match(missing.headers['content-type'],/json/)
 const preflight=await request(app).options('/api/items').set('Origin',origin).set('Access-Control-Request-Method','POST')
 assert.equal(preflight.status,204);assert.equal(preflight.headers['access-control-allow-origin'],origin)
 assert.ok(calls.some(x=>x.includes('/consume_api_rate_limit')))
 limiterFails=true
 const failed=await request(app).get('/api/me').set('Authorization','Bearer user-fixture')
 assert.equal(failed.status,503); assert.ok(!failed.text.includes('sensitive diagnostic'))
})

test('deadline cancels upstream fetch and concurrent requests remain isolated',async t=>{
 const {boundedFetch}=await import('../server/request-context.ts')
 let aborted=false
 t.mock.method(globalThis,'fetch',async (_input:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
  init!.signal!.addEventListener('abort',()=>{aborted=true;reject(init!.signal!.reason)},{once:true})
 }))
 const app=createApp({origin,requestTimeoutMs:40,authenticate:async token=>{
  if(token==='slow')await boundedFetch('https://school.example/slow')
  return {profile,store:{}} as AuthContext
 }})
 const [slow,fast]=await Promise.all([
  request(app).get('/api/me').set('Authorization','Bearer slow'),
  request(app).get('/api/me').set('Authorization','Bearer fast'),
 ])
 assert.equal(slow.status,504);assert.equal(fast.status,200);assert.equal(aborted,true)
})

test('shared write limiter runs before mutation and RPC failures stop requests',async()=>{
 const calls:string[]=[]
 const app=createApp({origin,distributedRateLimit:true,authenticate:async()=>({profile,store:{
  consumeRateLimit:async(scope:string)=>{calls.push(scope);return scope==='read'},
  saveItem:async()=>{throw new Error('must not run')},
 }} as unknown as AuthContext)})
 assert.equal((await request(app).post('/api/items').set('Authorization','Bearer fixture').send({})).status,429)
 assert.deepEqual(calls,['read','write'])
})
