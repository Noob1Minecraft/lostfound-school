import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagingConfig } from '../integration/support.ts'
test('live integration is blocked without explicit staging opt-in',()=>assert.throws(()=>stagingConfig({}),/Blocked/))
test('live integration is blocked when project reference differs',()=>{
 const env={APP_ENV:'staging',RUN_STAGING_TESTS:'yes',STAGING_PROJECT_REF:'wrong',SUPABASE_URL:'https://stage.supabase.co',VITE_SUPABASE_URL:'https://stage.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',SUPABASE_STORAGE_SECRET_KEY:'sb_secret_fake',FRONTEND_ORIGIN:'http://localhost:5173',VITE_API_URL:'/api'}
 assert.throws(()=>stagingConfig(env),/STAGING_PROJECT_REF/)
})
