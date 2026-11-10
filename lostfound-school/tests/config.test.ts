import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEnvironment, validatePublicEnvironment } from '../shared/config.ts'
const publicEnv={VITE_SUPABASE_URL:'https://staging.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_API_URL:'/api'}
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
