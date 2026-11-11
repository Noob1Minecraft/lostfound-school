type Environment = Record<string,string|undefined>
function role(key:string):string|undefined {
 try { return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role } catch { return undefined }
}
function publicKey(key:string) { return key.startsWith('sb_publishable_') || role(key)==='anon' }
function secretKey(key:string) { return key.startsWith('sb_secret_') || role(key)==='service_role' }
function safeUrl(value:string,originOnly=false) {
 try { const u=new URL(value);return !u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))&&(!originOnly||u.pathname==='/') } catch {return false}
}
export function validatePublicEnvironment(env:Environment):string[] {
 const errors:string[]=[]
 const allowed=new Set(['VITE_AUTH_PROVIDER','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_API_URL'])
 for(const [name,value] of Object.entries(env))if(name.startsWith('VITE_')&&value&&!allowed.has(name))errors.push(`${name}: browser variable is not allowlisted`)
 if(env.VITE_AUTH_PROVIDER&&!['supabase','neon'].includes(env.VITE_AUTH_PROVIDER))errors.push('VITE_AUTH_PROVIDER: expected supabase or neon')
 if(env.VITE_AUTH_PROVIDER==='neon'&&env.VITE_API_URL&&env.VITE_API_URL!=='/api')errors.push('VITE_API_URL: Neon requires same-origin /api')
 for(const [name,value] of Object.entries(env)) if(name.startsWith('VITE_')&&value&&(secretKey(value)||/SECRET|SERVICE_ROLE|PASSWORD/i.test(name))) errors.push(`${name}: privileged values cannot be exposed to the browser`)
 if(env.VITE_SUPABASE_URL&&!safeUrl(env.VITE_SUPABASE_URL,true))errors.push('VITE_SUPABASE_URL: expected HTTPS project origin')
 if(env.VITE_SUPABASE_PUBLISHABLE_KEY&&!publicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY))errors.push('VITE_SUPABASE_PUBLISHABLE_KEY: expected publishable or legacy anon key')
 if(env.VITE_API_URL&&env.VITE_API_URL!=='/api'&&!safeUrl(env.VITE_API_URL))errors.push('VITE_API_URL: expected /api or HTTPS API URL without credentials')
 return errors
}
export function validateServerEnvironment(env:Environment,requireUploads=false):string[] {
 const errors:string[]=[]
 if(env.BACKEND_PROVIDER&&!['supabase','neon'].includes(env.BACKEND_PROVIDER))errors.push('BACKEND_PROVIDER: expected supabase or neon')
 if(env.BACKEND_PROVIDER==='neon') {
  let validDatabase=false
  try { const u=new URL(env.DATABASE_URL||'');validDatabase=['postgresql:','postgres:'].includes(u.protocol)&&u.hostname.endsWith('.neon.tech')&&decodeURIComponent(u.username)==='school_runtime'&&!!u.password&&u.pathname.length>1&&!u.hash&&u.searchParams.get('sslmode')==='verify-full'&&[...u.searchParams.keys()].every(k=>k==='sslmode') } catch { /* report names only */ }
  if(!validDatabase)errors.push('DATABASE_URL: required Neon school_runtime PostgreSQL URL with sslmode=verify-full')
  if(!env.NEON_AUTH_URL||!safeUrl(env.NEON_AUTH_URL)||!env.NEON_AUTH_URL.startsWith('https://'))errors.push('NEON_AUTH_URL: required HTTPS managed authentication URL')
  for(const name of ['S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'])if(!env[name])errors.push(`${name}: required server-only object storage configuration`)
  if(env.S3_ENDPOINT&&(!safeUrl(env.S3_ENDPOINT,true)||!env.S3_ENDPOINT.startsWith('https://')))errors.push('S3_ENDPOINT: expected HTTPS object storage origin')
  if(env.S3_BUCKET&&!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.S3_BUCKET))errors.push('S3_BUCKET: invalid bucket name')
  if(!env.FRONTEND_ORIGIN||!safeUrl(env.FRONTEND_ORIGIN,true))errors.push('FRONTEND_ORIGIN: required application origin')
  return errors
 }
 if(!env.SUPABASE_URL||!safeUrl(env.SUPABASE_URL,true))errors.push('SUPABASE_URL: required HTTPS project origin')
 if(!env.SUPABASE_PUBLISHABLE_KEY||!publicKey(env.SUPABASE_PUBLISHABLE_KEY))errors.push('SUPABASE_PUBLISHABLE_KEY: required publishable or legacy anon key')
 if((requireUploads||env.SUPABASE_STORAGE_SECRET_KEY)&&!secretKey(env.SUPABASE_STORAGE_SECRET_KEY??''))errors.push('SUPABASE_STORAGE_SECRET_KEY: required server-only secret/service-role key for uploads')
 if(!safeUrl(env.FRONTEND_ORIGIN||'http://localhost:5173',true))errors.push('FRONTEND_ORIGIN: expected a single origin without path')
 if(!/^\d+$/.test(env.PORT||'3001')||Number(env.PORT||3001)<1||Number(env.PORT||3001)>65535)errors.push('PORT: expected integer 1–65535')
 if(!/^\d+$/.test(env.TRUST_PROXY_HOPS||'0')||Number(env.TRUST_PROXY_HOPS||0)>10)errors.push('TRUST_PROXY_HOPS: expected integer 0–10')
 return errors
}
export function validateEnvironment(env:Environment):string[] {
 const errors=[...validatePublicEnvironment(env),...validateServerEnvironment(env,true)]
 if(env.BACKEND_PROVIDER==='neon') {
  if(env.VITE_AUTH_PROVIDER!=='neon')errors.push('VITE_AUTH_PROVIDER: must match BACKEND_PROVIDER=neon')
  if(env.VITE_API_URL!=='/api')errors.push('VITE_API_URL: required /api')
  return errors
 }
 if(env.VITE_AUTH_PROVIDER==='neon')errors.push('BACKEND_PROVIDER: must match VITE_AUTH_PROVIDER=neon')
 for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_API_URL','FRONTEND_ORIGIN'])if(!env[key])errors.push(`${key}: required for staging`)
 if(env.SUPABASE_URL&&env.VITE_SUPABASE_URL&&env.SUPABASE_URL.replace(/\/$/,'')!==env.VITE_SUPABASE_URL.replace(/\/$/,''))errors.push('SUPABASE_URL and VITE_SUPABASE_URL: must identify the same project')
 if(env.SUPABASE_PUBLISHABLE_KEY&&env.VITE_SUPABASE_PUBLISHABLE_KEY&&env.SUPABASE_PUBLISHABLE_KEY!==env.VITE_SUPABASE_PUBLISHABLE_KEY)errors.push('SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_PUBLISHABLE_KEY: use the same public key')
 return errors
}
