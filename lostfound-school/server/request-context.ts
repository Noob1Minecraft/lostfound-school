import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestHandler } from 'express'

const requests = new AsyncLocalStorage<AbortSignal>()
export const assertRequestActive = () => requests.getStore()?.throwIfAborted()

export const privateResponses: RequestHandler = (_req, res, next) => {
 res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' })
 res.vary('Authorization'); res.vary('Origin'); res.vary('Cookie'); next()
}

export function requestDeadline(milliseconds = 15_000): RequestHandler {
 return (_req, res, next) => {
  const controller = new AbortController()
  // Late async results must not write a second response after the deadline.
  const json = res.json.bind(res)
  res.json = body => res.writableEnded || res.destroyed ? res : json(body)
  const timer = setTimeout(() => {
   controller.abort(new DOMException('Request deadline exceeded', 'TimeoutError'))
   if (!res.headersSent) res.status(504).json({ error: 'Сервис не ответил вовремя. Проверь результат перед повтором действия.' })
  }, milliseconds)
  const clear = () => { clearTimeout(timer); controller.abort() }
  res.once('finish', clear); res.once('close', clear)
  requests.run(controller.signal, next)
 }
}

// Every Supabase Auth, PostgREST and Storage request gets both an upstream
// deadline and the invocation's cancellation signal. No per-user global state.
export const boundedFetch: typeof fetch = (input, init) => {
 const signals = [AbortSignal.timeout(8_000)]
 const requestSignal = requests.getStore()
 if (requestSignal) signals.push(requestSignal)
 if (init?.signal) signals.push(init.signal)
 if (input instanceof Request) signals.push(input.signal)
 const signal = AbortSignal.any(signals)
 signal.throwIfAborted()
 return fetch(input, { ...init, signal })
}
