import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp, type AuthContext } from '../server/app.ts'
import type { Item, ItemInput, Profile } from '../shared/domain.ts'
const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const itemId = '33333333-3333-4333-8333-333333333333'
const item: Item = { id: itemId, owner_id: alice, status: 'approved', type: 'lost', title: 'Наушники', category: 'Электроника', color: 'Чёрный', location: 'Библиотека', date: '2026-11-10', description: 'Чёрные наушники в чехле', image_path: null, created_at: '2026-11-10' }
const makeApp = () => createApp({ origin: 'http://localhost:5173', authenticate: async token => {
  if (!['alice', 'bob', 'admin'].includes(token)) return null
  const profile: Profile = { id: token === 'alice' ? alice : bob, role: token === 'admin' ? 'admin' : 'student', display_name: token }
  return { profile, store: { listItems: async () => [item], getItem: async () => item, saveItem: async (_id:string|null, value:Partial<ItemInput>) => ({ ...item, ...value }), stats: async () => ({ lost: 1 }), listClaims: async () => [] } } as unknown as AuthContext
} })
test('private routes reject missing and invalid tokens', async () => { for (const path of ['/api/items','/api/matches','/api/admin/stats']) { assert.equal((await request(makeApp()).get(path)).status,401); assert.equal((await request(makeApp()).get(path).set('Authorization','Bearer invalid')).status,401) } })
test('students cannot access admin routes', async () => { for (const path of ['/api/admin/claims','/api/admin/stats']) assert.equal((await request(makeApp()).get(path).set('Authorization','Bearer alice')).status,403) })
test('owner can edit but another student cannot', async () => { assert.equal((await request(makeApp()).patch(`/api/items/${itemId}`).set('Authorization','Bearer bob').send({ title: 'Изменено' })).status,403); const r = await request(makeApp()).patch(`/api/items/${itemId}`).set('Authorization','Bearer alice').send({ title: 'Изменено' }); assert.equal(r.status,200); assert.equal(r.body.title,'Изменено') })
test('rejects role/owner/status injection and malformed ids', async () => { for (const payload of [{role:'admin'},{owner_id:bob},{status:'returned'},{date:'2026-02-30'},{}]) assert.equal((await request(makeApp()).patch(`/api/items/${itemId}`).set('Authorization','Bearer alice').send(payload)).status,400); assert.equal((await request(makeApp()).get('/api/items/not-a-uuid').set('Authorization','Bearer alice')).status,400) })
test('catalog and real admin stats are available to permitted users', async () => { assert.equal((await request(makeApp()).get('/api/items').set('Authorization','Bearer alice')).body[0].title,'Наушники'); assert.equal((await request(makeApp()).get('/api/admin/stats').set('Authorization','Bearer admin')).status,200) })
test('errors do not expose internals and disallowed origins fail', async () => { const app = createApp({ origin:'http://localhost:5173', authenticate:async()=>{ throw new Error('secret database connection') } }); const r = await request(app).get('/api/items').set('Authorization','Bearer alice'); assert.equal(r.status,500); assert.ok(!r.text.includes('secret')); assert.equal((await request(makeApp()).get('/api/items').set('Origin','https://evil.example')).status,403) })
test('uploads reject spoofed bytes, unsupported formats, oversize and non-owners',async()=>{
 const path=`/api/items/${itemId}/image`
 assert.equal((await request(makeApp()).post(path).set('Authorization','Bearer alice').attach('image',Buffer.from('<svg/>'),{filename:'bad.svg',contentType:'image/svg+xml'})).status,400)
 assert.equal((await request(makeApp()).post(path).set('Authorization','Bearer alice').attach('image',Buffer.from('not an image'),{filename:'bad.jpg',contentType:'image/jpeg'})).status,400)
 assert.equal((await request(makeApp()).post(path).set('Authorization','Bearer alice').attach('image',Buffer.alloc(4_000_001),{filename:'large.jpg',contentType:'image/jpeg'})).status,400)
 assert.equal((await request(makeApp()).post(path).set('Authorization','Bearer bob').attach('image',Buffer.from('bad'),{filename:'bad.jpg',contentType:'image/jpeg'})).status,403)
})
