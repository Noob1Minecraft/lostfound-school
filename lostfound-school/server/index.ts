import { createApp } from './app.ts'
import { makeAuthenticator } from './store.ts'
import { validateServerEnvironment } from '../shared/config.ts'
const errors=validateServerEnvironment(process.env)
if(errors.length)throw new Error(errors.join('\n'))
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, FRONTEND_ORIGIN = 'http://localhost:5173', PORT = '3001' } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env (see .env.example)')
const app = createApp({distributedRateLimit:true,origin:FRONTEND_ORIGIN,authenticate:makeAuthenticator(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,process.env.SUPABASE_STORAGE_SECRET_KEY),trustProxy:process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : undefined})
const server = app.listen(Number(PORT),'0.0.0.0',()=>console.log(`API listening on port ${PORT}`))
process.on('SIGTERM',()=>server.close())
