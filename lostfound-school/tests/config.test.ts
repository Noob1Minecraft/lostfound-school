import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateEnvironment, validatePublicEnvironment } from '../shared/config.ts'
const publicEnv={VITE_SUPABASE_URL:'https://staging.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_API_URL:'/api'}
const vercelPreview=JSON.parse(readFileSync(new URL('./fixtures/vercel-preview.json',import.meta.url),'utf8'))

test('documented Vercel Preview metadata is accepted with either frontend provider',()=>{
 for(const app of [publicEnv,{VITE_AUTH_PROVIDER:'neon',VITE_API_URL:'/api'}])assert.deepEqual(validatePublicEnvironment({...app,...vercelPreview}),[])
})

test('Vercel namespace does not permit unknown or sensitive browser variables',()=>{
 for(const name of ['VITE_UNKNOWN','VITE_DATABASE_URL','VITE_VERCEL_UNKNOWN','VITE_VERCEL_TOKEN','VITE_VERCEL_SECRET','VITE_VERCEL_PASSWORD']) {
  const errors=validatePublicEnvironment({...vercelPreview,[name]:'private-fixture'})
  assert.ok(errors.some(error=>error===`${name}: browser variable is not allowlisted`))
  assert.ok(!errors.join().includes('private-fixture'))
 }
})

test('documented Vercel variables still reject privileged values without logging them',()=>{
 const legacy=`e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`
 for(const name of Object.keys(vercelPreview))for(const value of ['sb_secret_fixture',legacy]) {
  const errors=validatePublicEnvironment({...vercelPreview,[name]:value})
  assert.ok(errors.includes(`${name}: privileged values cannot be exposed to the browser`))
  assert.ok(!errors.join().includes(value))
 }
})
const env={...publicEnv,SUPABASE_URL:publicEnv.VITE_SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY,SUPABASE_STORAGE_SECRET_KEY:'sb_secret_fixture',FRONTEND_ORIGIN:'http://localhost:5173',PORT:'3001',TRUST_PROXY_HOPS:'0'}
test('valid staging environment has no errors',()=>assert.deepEqual(validateEnvironment(env),[]))
test('missing variables are reported by name, never value',()=>{const errors=validateEnvironment({});assert.ok(errors.some(x=>x.includes('SUPABASE_URL')));assert.ok(errors.some(x=>x.includes('SUPABASE_STORAGE_SECRET_KEY')))})
test('privileged browser keys and arbitrary VITE secret variables are refused',()=>{
 const legacy=`e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`
 for(const key of ['sb_secret_do-not-print',legacy]){const errors=validatePublicEnvironment({...publicEnv,VITE_SUPABASE_PUBLISHABLE_KEY:key});assert.ok(errors.length);assert.ok(!errors.join().includes(key))}
 assert.ok(validatePublicEnvironment({...publicEnv,VITE_STORAGE_SECRET_KEY:'private'}).length)
})
test('project mismatch, unsafe URLs, ports and proxy settings fail closed',()=>{
 for(const change of [{SUPABASE_URL:'https://other.supabase.co'},{VITE_API_URL:'https://user:password@host/api'},{FRONTEND_ORIGIN:'*'},{PORT:'NaN'},{TRUST_PROXY_HOPS:'-1'},{SUPABASE_STORAGE_SECRET_KEY:'sb_publishable_wrong'}])assert.ok(validateEnvironment({...env,...change}).length)
})
