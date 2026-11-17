import {test} from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import {createApp, type AuthContext} from '../server/app.ts'
const origin='https://school.example', id='11111111-1111-4111-8111-111111111111'
test('cookie API authenticates server-side and rejects cross-origin or missing-Origin writes',async()=>{
 let writes=0
 const auth={profile:{id,role:'student',display_name:'Student'},store:{closeItem:async()=>{writes++;return{id,status:'closed'}}}} as unknown as AuthContext
 const app=createApp({origin,authenticate:async()=>null,authenticateRequest:async req=>req.headers.cookie==='session=fixture'?auth:null})
 assert.equal((await request(app).get('/api/me')).status,401)
 assert.equal((await request(app).get('/api/me').set('Cookie','session=fixture')).status,200)
 for(const bad of [undefined,'https://other.example']){
  const req=request(app).post(`/api/items/${id}/close`).set('Cookie','session=fixture')
  if(bad)req.set('Origin',bad)
  assert.equal((await req).status,403)
 }
 assert.equal(writes,0)
 assert.equal((await request(app).post(`/api/items/${id}/close`).set('Cookie','session=fixture').set('Origin',origin)).status,200)
 assert.equal(writes,1)
 assert.equal((await request(app).get('/api/admin/members').set('Cookie','session=fixture')).status,403)
})
test('administrative membership mutations validate fields and unavailable adapters fail safely',async()=>{
 const auth={profile:{id,role:'admin',display_name:'Admin'},store:{manageMember:async(input:unknown)=>input}} as unknown as AuthContext
 const app=createApp({origin,authenticate:async()=>auth})
 assert.equal((await request(app).patch('/api/admin/members').set('Authorization','Bearer fixture').send({email:'member@example.test',role:'admin',password:'bad'})).status,400)
 assert.equal((await request(app).patch('/api/admin/members').set('Authorization','Bearer fixture').send({email:'member@example.test',role:'student',active:true})).status,200)
 assert.equal((await request(app).get('/api/admin/members').set('Authorization','Bearer fixture')).status,503)
})
