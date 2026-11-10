import express from 'express'
import { createApp } from './app.ts'
import { makeAuthenticator } from './store.ts'
import { validateServerEnvironment } from '../shared/config.ts'
import { privateResponses } from './request-context.ts'

export function createVercelApp(env: Record<string, string | undefined>) {
 if (validateServerEnvironment(env).length || !env.FRONTEND_ORIGIN || !env.FRONTEND_ORIGIN.startsWith('https://')) {
  const unavailable = express()
  unavailable.disable('x-powered-by'); unavailable.disable('etag')
  unavailable.use(privateResponses)
  unavailable.use((_req,res) => res.status(503).json({ error: 'Школьный сервис ещё не настроен' }))
  return unavailable
 }
 return createApp({
  origin: env.FRONTEND_ORIGIN,
  authenticate: makeAuthenticator(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, env.SUPABASE_STORAGE_SECRET_KEY),
  // One Vercel ingress proxy. Never trust arbitrary client-supplied hop counts.
  trustProxy: 1,
  distributedRateLimit: true,
 })
}
