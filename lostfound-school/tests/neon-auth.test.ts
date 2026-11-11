import { test } from 'node:test'
import assert from 'node:assert/strict'
import express, { type Request } from 'express'
import request from 'supertest'
import { createNeonAuthRouter, verifyNeonSession } from '../server/neon-auth.ts'
import { requestDeadline } from '../server/request-context.ts'
const origin='https://school.example', authUrl='https://branch.neonauth.example/neondb/auth'
const cookie='__Secure-neon-auth.session_token=opaque'
const good=()=>({user:{id:'external-id',email:'pupil@example.com',name:'Pupil',emailVerified:true,role:'admin'},session:{userId:'external-id',expiresAt:new Date(Date.now()+60000).toISOString(),token:'secret'}})
function setup(fetcher:typeof fetch){const app=express();app.use('/api/auth',createNeonAuthRouter({authUrl,origin,fetch:fetcher}));return app}
test('session verification is live, cookie-only and strips provider privilege',async()=>{
 let calls=0
 const fetcher:typeof fetch=async(url,init)=>{calls++;assert.equal(String(url),authUrl+'/get-session?disableCookieCache=true');assert.equal(new Headers(init?.headers).get('cookie'),cookie);assert.equal(new Headers(init?.headers).get('authorization'),null);assert.equal(init?.redirect,'manual');return Response.json(good())}
 const req={headers:{cookie:cookie+'; unrelated=private',authorization:'Bearer forged'}} as Request
 assert.deepEqual(await verifyNeonSession(req,{authUrl,origin,fetch:fetcher}),{id:'external-id',email:'pupil@example.com',name:'Pupil'})
 await verifyNeonSession(req,{authUrl,origin,fetch:fetcher});assert.equal(calls,2)
})
test('unverified, banned, expired and malformed sessions fail closed',async()=>{
 for(const data of [null,{...good(),user:{...good().user,emailVerified:false}},{...good(),user:{...good().user,banned:true}},{...good(),session:{expiresAt:'2000-01-01'}},{user:good().user}]){
  assert.equal(await verifyNeonSession({headers:{cookie}} as Request,{authUrl,origin,fetch:async()=>Response.json(data)}),null)
 }
})
test('proxy blocks unknown paths, CSRF, wrong types, queries and privileged fields',async()=>{
 let calls=0;const app=setup(async()=>{calls++;return Response.json({})})
 await request(app).post('/api/auth/admin/set-role').set('Origin',origin).send({}).expect(404)
 await request(app).post('/api/auth/sign-out').send({}).expect(403)
 await request(app).post('/api/auth/sign-out').set('Origin','https://evil.example').send({}).expect(403)
 await request(app).post('/api/auth/sign-out').set('Origin',origin).type('form').send('x=y').expect(415)
 await request(app).post('/api/auth/sign-out?url=https://evil.example').set('Origin',origin).send({}).expect(400)
 await request(app).post('/api/auth/sign-up/email').set('Origin',origin).send({email:'a@b.test',password:'password123',name:'A',role:'admin'}).expect(400)
 assert.equal(calls,0)
})
test('proxy limits callbacks and request bodies and sanitizes cookies/responses',async()=>{
 let body='';const app=setup(async(_url,init)=>{body=String(init?.body);return Response.json({token:'secret',user:{role:'admin'}},{headers:{'set-cookie':cookie+'; Domain=neonauth.example; Path=/; SameSite=None'}})})
 await request(app).post('/api/auth/sign-up/email').set('Origin',origin).send({email:'a@b.test',password:'password123',name:'A',callbackURL:'https://evil.example/login'}).expect(400)
 await request(app).post('/api/auth/sign-out').set('Origin',origin).send({a:'x'.repeat(20000)}).expect(413)
 const res=await request(app).post('/api/auth/sign-in/email').set('Origin',origin).send({email:'a@b.test',password:'password123'}).expect(200)
 assert.deepEqual(res.body,{ok:true});assert.equal(JSON.parse(body).password,'password123')
 assert.deepEqual(res.headers['set-cookie'],[cookie+'; Path=/api; HttpOnly; Secure; SameSite=Lax'])
})
test('provider failures and redirects never leak messages or forward redirects',async()=>{
 for(const response of [new Response('secret',{status:500}),new Response(null,{status:302,headers:{location:'https://evil.example'}})]){
 const res=await request(setup(async()=>response)).post('/api/auth/sign-out').set('Origin',origin).send({}).expect(503);assert.ok(!JSON.stringify(res.body).includes('secret'));assert.equal(res.headers.location,undefined)
 }
 await request(setup(async()=>{throw new Error('secret')})).get('/api/auth/get-session').set('Cookie',cookie).expect(503)
})
test('get-session exposes only normalized verified session and rejects cached identity cookies',async()=>{
 const res=await request(setup(async()=>Response.json(good()))).get('/api/auth/get-session').set('Cookie',cookie).expect(200)
 assert.deepEqual(Object.keys(res.body).sort(),['expiresAt','user']);assert.deepEqual(Object.keys(res.body.user).sort(),['email','id','name'])
 let called=false;const none=await request(setup(async()=>{called=true;return Response.json(good())})).get('/api/auth/get-session').set('Cookie','__Secure-neon-auth.session_data=forged').expect(200)
 assert.equal(none.body,null);assert.equal(called,false)
})
test('verification redirects allow only local login and sanitize provider query',async()=>{
 const app=setup(async(url,init)=>{assert.equal(init?.redirect,'manual');assert.ok(String(url).startsWith(authUrl+'/verify-email?token=proof&callbackURL='));return new Response(null,{status:302,headers:{location:origin+'/login?error=untrusted-secret'}})})
 const res=await request(app).get('/api/auth/verify-email?token=proof').expect(303)
 assert.equal(res.headers.location,origin+'/login?error=verification_failed')
 await request(setup(async()=>new Response(null,{status:302,headers:{location:'https://evil.example/login'}}))).get('/api/auth/verify-email?token=proof').expect(503)
 await request(app).get('/api/auth/verify-email?token=proof&role=admin').expect(400)
 await request(setup(async()=>new Response('private',{status:500}))).get('/api/auth/verify-email?token=proof').expect(503)
})
test('invalid configuration, duplicate cookies and expired cookie deletion fail safely',async()=>{
 assert.throws(()=>createNeonAuthRouter({authUrl:'http://insecure.example',origin}))
 assert.throws(()=>createNeonAuthRouter({authUrl:authUrl+'?redirect=evil',origin}))
 let called=false
 assert.equal(await verifyNeonSession({headers:{cookie:cookie+'; '+cookie}} as Request,{authUrl,origin,fetch:async()=>{called=true;return Response.json(good())}}),null);assert.equal(called,false)
 const app=setup(async()=>Response.json({},{headers:{'set-cookie':'__Secure-neon-auth.session_token=; Max-Age=0; Path=/; Domain=evil.example'}}))
 const res=await request(app).post('/api/auth/sign-out').set('Origin',origin).send({}).expect(200)
 assert.deepEqual(res.headers['set-cookie'],['__Secure-neon-auth.session_token=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
})
test('protected request propagates managed session renewal cookie',async()=>{
 const app=express()
 app.get('/api/private',async(req,res)=>{
  const user=await verifyNeonSession(req,{authUrl,origin,fetch:async()=>Response.json(good(),{headers:{'set-cookie':'__Secure-neon-auth.session_token=renewed; Max-Age=3600; Domain=provider.example; Path=/'}})},res)
  res.json(user)
 })
 const response=await request(app).get('/api/private').set('Cookie',cookie).expect(200)
 assert.deepEqual(response.headers['set-cookie'],['__Secure-neon-auth.session_token=renewed; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=3600'])
 assert.equal(response.body.id,'external-id')
})
test('new passwords require twelve characters while existing shorter credentials can sign in',async()=>{
 let calls=0;const app=setup(async()=>{calls++;return Response.json({})})
 await request(app).post('/api/auth/sign-up/email').set('Origin',origin).send({email:'a@b.test',name:'A',password:'12345678901'}).expect(400)
 await request(app).post('/api/auth/reset-password').set('Origin',origin).send({token:'proof',newPassword:'12345678901'}).expect(400)
 assert.equal(calls,0)
 await request(app).post('/api/auth/sign-in/email').set('Origin',origin).send({email:'a@b.test',password:'short'}).expect(200)
 await request(app).post('/api/auth/sign-up/email').set('Origin',origin).send({email:'a@b.test',name:'A',password:'123456789012'}).expect(200)
 await request(app).post('/api/auth/reset-password').set('Origin',origin).send({token:'proof',newPassword:'123456789012'}).expect(200)
})
test('default provider fetch is cancelled by the enclosing request deadline',async(t)=>{
 let signal:AbortSignal|undefined
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
  signal=init.signal as AbortSignal
  return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))
 })
 const app=express();app.use(requestDeadline(40));app.use('/api/auth',createNeonAuthRouter({authUrl,origin}))
 await request(app).get('/api/auth/get-session').set('Cookie',cookie).expect(504)
 assert.equal(signal?.aborted,true)
})
