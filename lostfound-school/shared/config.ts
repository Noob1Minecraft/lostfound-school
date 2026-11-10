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
 for(const [name,value] of Object.entries(env)) if(name.startsWith('VITE_')&&value&&(secretKey(value)||/SECRET|SERVICE_ROLE|PASSWORD/i.test(name))) errors.push(`${name}: privileged values cannot be exposed to the browser`)
 if(env.VITE_SUPABASE_URL&&!safeUrl(env.VITE_SUPABASE_URL,true))errors.push('VITE_SUPABASE_URL: expected HTTPS project origin')
 if(env.VITE_SUPABASE_PUBLISHABLE_KEY&&!publicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY))errors.push('VITE_SUPABASE_PUBLISHABLE_KEY: expected publishable or legacy anon key')
 if(env.VITE_API_URL&&env.VITE_API_URL!=='/api'&&!safeUrl(env.VITE_API_URL))errors.push('VITE_API_URL: expected /api or HTTPS API URL without credentials')
 return errors
}
export function validateServerEnvironment(env:Environment,requireUploads=false):string[] {
 const errors:string[]=[]
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
 for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_API_URL','FRONTEND_ORIGIN'])if(!env[key])errors.push(`${key}: required for staging`)
 if(env.SUPABASE_URL&&env.VITE_SUPABASE_URL&&env.SUPABASE_URL.replace(/\/$/,'')!==env.VITE_SUPABASE_URL.replace(/\/$/,''))errors.push('SUPABASE_URL and VITE_SUPABASE_URL: must identify the same project')
 if(env.SUPABASE_PUBLISHABLE_KEY&&env.VITE_SUPABASE_PUBLISHABLE_KEY&&env.SUPABASE_PUBLISHABLE_KEY!==env.VITE_SUPABASE_PUBLISHABLE_KEY)errors.push('SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_PUBLISHABLE_KEY: use the same public key')
 return errors
}
