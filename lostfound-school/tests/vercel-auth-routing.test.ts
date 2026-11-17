import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {convertRewrites} from '@vercel/routing-utils'
import express from 'express'
import request from 'supertest'
import {createNeonAuthRouter} from '../server/neon-auth.ts'

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
const origin='https://school.example',authUrl='https://branch.neonauth.example/auth'
const route=convertRewrites([config.rewrites[0]])[0]
if(!('src' in route)||typeof route.src!=='string'||typeof route.dest!=='string')throw new Error('Expected API function rewrite')
const src=route.src,dest=route.dest
function routedApp(fetcher:typeof fetch){
 const app=express()
 app.use((req,_res,next)=>{
  // Vercel invokes the function at dest but exposes the incoming path to Express.
  // Include any query synthesized by Vercel's actual rewrite compiler.
  const original=new URL(req.url,origin)
  const rewritten=new URL(original.pathname.replace(new RegExp(src),dest),origin)
  for(const [key,value] of rewritten.searchParams)original.searchParams.append(key,value)
  req.url=original.pathname+original.search;next()
 })
 app.use('/api/auth',createNeonAuthRouter({origin,authUrl,fetch:fetcher}))
 return app
}
test('compiled Vercel API rewrite preserves paths without adding query parameters',()=>{
 for(const path of ['/api','/api/','/api/health','/api/auth/get-session','/api/items/123/image']) {
  assert.ok(new RegExp(src).test(path))
  assert.equal(path.replace(new RegExp(src),dest),'/api')
 }
 for(const path of ['/apix','/login','/app/items/123','/assets/app.js'])assert.equal(new RegExp(src).test(path),false)
})
test('routed anonymous session is null without contacting Neon',async()=>{
 let calls=0
 const res=await request(routedApp(async()=>{calls++;throw new Error('Unexpected upstream call')})).get('/api/auth/get-session').expect(200)
 assert.equal(res.body,null);assert.equal(calls,0);assert.equal(res.headers['cache-control'],'no-store')
})
test('routed authenticated session retains server-controlled cache bypass and strips secrets',async()=>{
 const app=routedApp(async(url,init)=>{
  assert.equal(String(url),authUrl+'/get-session?disableCookieCache=true')
  assert.equal(init?.method,'GET');assert.equal(new Headers(init?.headers).get('Origin'),origin)
  return Response.json({user:{id:'fixture',email:'student@example.com',name:'Student',emailVerified:true},session:{expiresAt:new Date(Date.now()+60000).toISOString(),token:'private-fixture'}})
 })
 const res=await request(app).get('/api/auth/get-session').set('Cookie','__Secure-neon-auth.session_token=fixture').expect(200)
 assert.equal(res.body.user.id,'fixture');assert.ok(!JSON.stringify(res.body).includes('private-fixture'))
})
test('routed Auth still rejects client query parameters before upstream access',async()=>{
 let calls=0
 const app=routedApp(async()=>{calls++;return Response.json(null)})
 for(const query of ['path=auth/get-session','disableCookieCache=true','unexpected=1','token=private-fixture','path=a&path=b']) {
  const res=await request(app).get('/api/auth/get-session?'+query).expect(400)
  assert.ok(!JSON.stringify(res.body).includes('private-fixture'))
 }
 await request(app).get('/api/auth/get-session').set('Origin','https://evil.example').expect(403)
 assert.equal(calls,0)
})
