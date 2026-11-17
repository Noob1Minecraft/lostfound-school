import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEnvironment, validatePublicEnvironment, validateServerEnvironment } from '../shared/config.ts'
import request from 'supertest'
import {createVercelApp} from '../server/vercel.ts'

const env = { BACKEND_PROVIDER:'neon', VITE_AUTH_PROVIDER:'neon', VITE_API_URL:'/api', FRONTEND_ORIGIN:'https://school.example', DATABASE_URL:'postgresql://school_runtime:fixture@ep-example.neon.tech/school?sslmode=verify-full', NEON_AUTH_URL:'https://ep-example.neonauth.us-east-1.aws.neon.tech/school/auth', S3_ENDPOINT:'https://storage.example.neon.tech', S3_REGION:'us-east-1', S3_BUCKET:'item-images', S3_ACCESS_KEY_ID:'fixture-id', S3_SECRET_ACCESS_KEY:'fixture-secret' }
test('Neon configuration is explicit and does not require Supabase', () => assert.deepEqual(validateEnvironment(env), []))
test('Neon configuration fails closed for missing services and unsafe runtime credentials', () => {
 for (const name of ['DATABASE_URL','NEON_AUTH_URL','S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY']) {
  const errors=validateServerEnvironment({...env,[name]:''},true)
  assert.ok(errors.some(x=>x.includes(name)),name)
  assert.ok(!errors.join().includes('fixture-secret'))
 }
 for(const change of [{DATABASE_URL:'postgres://neondb_owner:fixture@ep-example.neon.tech/db?sslmode=require'},{NEON_AUTH_URL:'http://evil.example/auth'},{BACKEND_PROVIDER:'unknown'},{VITE_AUTH_PROVIDER:'unknown'},{VITE_API_URL:'https://other.example/api'}]) assert.ok(validateEnvironment({...env,...change}).length)
})
test('unknown browser environment names and database/S3 credentials cannot be bundled',()=>{
 for(const change of [{VITE_DATABASE_URL:env.DATABASE_URL},{VITE_S3_ACCESS_KEY_ID:'fixture-id'},{VITE_UNKNOWN:'value'},{VITE_API_URL:env.DATABASE_URL}]) assert.ok(validatePublicEnvironment(change).length)
})
test('Neon Vercel adapter keeps routes private and does not fall back to bearer auth',async()=>{
 const app=createVercelApp(env)
 assert.equal((await request(app).get('/api/health')).status,200)
 const auth=await request(app).get('/api/auth/get-session')
 assert.equal(auth.status,200);assert.equal(auth.body,null)
 assert.equal((await request(app).get('/api/me').set('Authorization','Bearer forged')).status,401)
 assert.equal((await request(app).post('/api/auth/sign-in/email').send({email:'fixture@example.test',password:'fixture-password'})).status,403)
 const unavailable=await request(createVercelApp({...env,DATABASE_URL:''})).get('/api/auth/get-session')
 assert.equal(unavailable.status,503);assert.match(unavailable.headers['cache-control'],/no-store/)
})
