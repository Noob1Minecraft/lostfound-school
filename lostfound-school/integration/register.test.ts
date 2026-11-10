import { test } from 'node:test'
import { client, ensure, stagingConfig } from './support.ts'
test('staging public registration requires email confirmation and cannot assign roles',async()=>{
 const {url,key,origin}=stagingConfig()
 for(const name of ['STAGING_STUDENT_A','STAGING_STUDENT_B','STAGING_ADMIN','STAGING_OUTSIDER']) {
  const {data,error}=await client(url,key).auth.signUp({email:process.env[`${name}_EMAIL`]!,password:process.env[`${name}_PASSWORD`]!,options:{emailRedirectTo:`${origin}/login`,data:{display_name:'Staging tester',role:'admin'}}})
  ensure(!error&&data.user,`${name}: registration request failed; check SMTP, Auth logs and rate limits`)
  ensure(!data.session,`${name}: email confirmation must be enabled`)
 }
 console.log('Registration requests accepted. Confirm all four emails manually before the workflow suite. Existing-account obfuscation means this alone does not prove new users were created.')
})
