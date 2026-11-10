import { createClient } from '@supabase/supabase-js'
import { validateEnvironment } from '../shared/config.ts'
export function stagingConfig(env:Record<string,string|undefined>=process.env) {
 if(env.RUN_STAGING_TESTS!=='yes'||env.APP_ENV!=='staging')throw new Error('Blocked: set APP_ENV=staging and RUN_STAGING_TESTS=yes only for your dedicated staging project')
 const errors=validateEnvironment(env)
 if(errors.length)throw new Error(errors.join('\n'))
 const ref=env.STAGING_PROJECT_REF
 if(!ref||! /^[a-z0-9-]+$/.test(ref)||new URL(env.SUPABASE_URL!).hostname!==`${ref}.supabase.co`)throw new Error('Blocked: STAGING_PROJECT_REF must match the configured hosted staging project')
 for(const name of ['STAGING_STUDENT_A','STAGING_STUDENT_B','STAGING_ADMIN','STAGING_OUTSIDER']) {
  if(!env[`${name}_EMAIL`]||!env[`${name}_PASSWORD`]||env[`${name}_PASSWORD`]!.length<12)throw new Error(`${name}: set a dedicated test email and a password of at least 12 characters`)
 }
 const emails=['STAGING_STUDENT_A','STAGING_STUDENT_B','STAGING_ADMIN','STAGING_OUTSIDER'].map(name=>env[`${name}_EMAIL`]!.trim().toLowerCase())
 if(new Set(emails).size!==4)throw new Error('Test accounts must use four distinct emails')
 return {url:env.SUPABASE_URL!,key:env.SUPABASE_PUBLISHABLE_KEY!,storageKey:env.SUPABASE_STORAGE_SECRET_KEY!,origin:env.FRONTEND_ORIGIN!}
}
export const client=(url:string,key:string)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
export function ensure(value:unknown,label:string):asserts value { if(!value)throw new Error(label) }
// Never forward raw Supabase error objects, passwords, responses or tokens to test logs.
export async function login(url:string,key:string,name:string) {
 const db=client(url,key)
 const {data,error}=await db.auth.signInWithPassword({email:process.env[`${name}_EMAIL`]!,password:process.env[`${name}_PASSWORD`]!})
 ensure(!error&&data.session,`${name}: login failed; confirm email and check credentials`)
 return {db,token:data.session.access_token,id:data.session.user.id}
}
