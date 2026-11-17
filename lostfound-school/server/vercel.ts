import express from 'express'
import { createApp } from './app.ts'
import { makeAuthenticator } from './store.ts'
import { validateServerEnvironment } from '../shared/config.ts'
import { privateResponses } from './request-context.ts'
import {createNeonAuthRouter,verifyNeonSession} from './neon-auth.ts'
import {createNeonDatabase} from './neon-database.ts'
import {createObjectStorage} from './object-storage.ts'

export function createVercelApp(env: Record<string, string | undefined>) {
 if (validateServerEnvironment(env).length || !env.FRONTEND_ORIGIN || !env.FRONTEND_ORIGIN.startsWith('https://')) {
  const unavailable = express()
  unavailable.disable('x-powered-by'); unavailable.disable('etag')
  unavailable.use(privateResponses)
  unavailable.use((_req,res) => res.status(503).json({ error: 'Школьный сервис ещё не настроен' }))
  return unavailable
 }
 if(env.BACKEND_PROVIDER==='neon') {
  const settings={authUrl:env.NEON_AUTH_URL!,origin:env.FRONTEND_ORIGIN}
  const database=createNeonDatabase(env.DATABASE_URL!)
  const images=createObjectStorage({endpoint:env.S3_ENDPOINT!,region:env.S3_REGION!,bucket:env.S3_BUCKET!,accessKeyId:env.S3_ACCESS_KEY_ID!,secretAccessKey:env.S3_SECRET_ACCESS_KEY!})
  return createApp({origin:settings.origin,trustProxy:1,distributedRateLimit:true,authenticate:async()=>null,authRouter:createNeonAuthRouter(settings),authenticateRequest:async (req,res)=>{
   const identity=await verifyNeonSession(req,settings,res)
   if(!identity)return null
   const profile=await database.resolveIdentity(identity)
   return {profile,store:database.store(profile,images)}
  }})
 }
 return createApp({
  origin: env.FRONTEND_ORIGIN,
  authenticate: makeAuthenticator(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, env.SUPABASE_STORAGE_SECRET_KEY),
  // One Vercel ingress proxy. Never trust arbitrary client-supplied hop counts.
  trustProxy: 1,
  distributedRateLimit: true,
 })
}
