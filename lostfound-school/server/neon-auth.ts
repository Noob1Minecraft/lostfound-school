import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { HttpError } from './errors.ts'
import { boundedFetch } from './request-context.ts'

type Options = { authUrl: string; origin: string; fetch?: typeof fetch }
type Identity = { id: string; email: string; name: string }
const COOKIE = '__Secure-neon-auth.session_token'
const unavailable = () => new HttpError(503, 'Сервис входа временно недоступен')
const email = z.string().email().max(254), password = z.string().min(12).max(128)
const token = z.string().min(1).max(4096).regex(/^[A-Za-z0-9._~+/%=-]+$/)
const callback = z.string().max(2048).optional()
const bodies = {
 'sign-in/email': z.object({email,password:z.string().min(1).max(128),callbackURL:callback,rememberMe:z.boolean().optional()}).strict(),
 'sign-up/email': z.object({email,password,name:z.string().trim().min(1).max(100),callbackURL:callback}).strict(),
 'sign-out': z.object({}).strict(),
 'request-password-reset': z.object({email,redirectTo:callback}).strict(),
 'reset-password': z.object({token,newPassword:password}).strict(),
 'send-verification-email': z.object({email,callbackURL:callback}).strict(),
}
function config(options: Options) {
 const auth = new URL(options.authUrl), origin = new URL(options.origin)
 if (auth.protocol !== 'https:' || auth.username || auth.password || auth.search || auth.hash || origin.protocol !== 'https:' || origin.origin !== options.origin) throw unavailable()
 return {base:auth.href.replace(/\/$/,''),origin:options.origin,fetch:options.fetch ?? boundedFetch}
}
function sessionCookie(req: Request) {
 const cookies = (req.headers.cookie ?? '').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='))
 if (cookies.length !== 1 || cookies[0].length > 8192 || !new RegExp('^'+COOKIE.replaceAll('.','\\.')+'=[A-Za-z0-9._~+/%=-]+$').test(cookies[0])) return ''
 return cookies[0]
}
function setCookies(upstream: globalThis.Response, res: Response) {
 for (const raw of upstream.headers.getSetCookie()) {
  const [pair,...attrs] = raw.split(';').map(x=>x.trim())
  if (!pair.startsWith(COOKIE+'=') || !/^[A-Za-z0-9._~+/%=-]*$/.test(pair.slice(COOKIE.length+1))) continue
  let result = pair+'; Path=/api; HttpOnly; Secure; SameSite=Lax'
  for (const attr of attrs) {
   if (/^max-age=-?\d+$/i.test(attr)) result += '; '+attr
   if (/^expires=/i.test(attr)) {const date = new Date(attr.slice(8));if (Number.isFinite(date.getTime())) result += '; Expires='+date.toUTCString()}
  }
  res.append('Set-Cookie',result)
 }
}
function approvedCallback(value: unknown, origin: string, path: string) {
 if (value === undefined) return origin+path
 if (typeof value !== 'string' || value !== origin+path) throw new HttpError(400,'Недопустимый адрес возврата')
 return value
}
async function upstream(options: Options, req: Request, path: string, body?: unknown) {
 const settings = config(options)
 const headers = new Headers({'Origin':settings.origin,'Accept':'application/json','x-neon-auth-middleware':'true'})
 const cookie = sessionCookie(req);if (cookie) headers.set('Cookie',cookie)
 if (body !== undefined) headers.set('Content-Type','application/json')
 try {
  return await settings.fetch(settings.base+'/'+path,{method:body === undefined ? 'GET' : 'POST',headers,body:body === undefined ? undefined : JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(8000)})
 } catch { throw unavailable() }
}
async function json(response: globalThis.Response): Promise<unknown> {
 // Bound provider output as well as input. Never log raw provider messages.
 try {
  const reader=response.body?.getReader();if (!reader) return null
  const chunks:Uint8Array[]=[];let bytes=0
  while (true) {const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();throw unavailable()}chunks.push(value)}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
 } catch {throw unavailable()}
}
const sessionSchema=z.object({user:z.object({id:z.string().min(1).max(256),email,name:z.string().max(200),emailVerified:z.literal(true),banned:z.boolean().nullish()}),session:z.object({expiresAt:z.string(),userId:z.string().optional()})})
function normalize(data: unknown): {user:Identity;expiresAt:string}|null {
 const result=sessionSchema.safeParse(data);if(!result.success)return null
 const {user,session}=result.data
 if(user.banned || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt)<=Date.now() || (session.userId !== undefined && session.userId !== user.id))return null
 return {user:{id:user.id,email:user.email,name:user.name},expiresAt:session.expiresAt}
}
async function liveSession(req:Request,options:Options,res?:Response) {
 if(!sessionCookie(req))return null
 const response=await upstream(options,req,'get-session?disableCookieCache=true')
 if(response.status===401 || response.status===403)return null
 if(!response.ok)throw unavailable()
 const session=normalize(await json(response));if(res)setCookies(response,res)
 return session
}
export async function verifyNeonSession(req:Request,options:Options,res?:Response):Promise<Identity|null> {
 config(options)
 return (await liveSession(req,options,res))?.user ?? null
}
export function createNeonAuthRouter(options:Options) {
 config(options)
 const router=express.Router({caseSensitive:true,strict:true})
 router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer'});next()})
 router.use((req,_res,next)=>{
  if(req.method==='POST') {
   if(req.headers.origin!==options.origin)throw new HttpError(403,'Источник запроса запрещён')
   if(!req.is('application/json'))throw new HttpError(415,'Требуется JSON')
  } else if (req.headers.origin && req.headers.origin!==options.origin)throw new HttpError(403,'Источник запроса запрещён')
  next()
 })
 router.use(express.json({limit:'16kb'}))
 router.use(async(req,res)=>{
  const path=req.path.slice(1)
  if(req.method==='GET' && path==='verify-email') {
   const query=z.object({token,callbackURL:callback}).strict().safeParse(req.query)
   if(!query.success)throw new HttpError(400,'Неверная ссылка подтверждения')
   const target=approvedCallback(query.data.callbackURL,options.origin,'/login')
   const response=await upstream(options,req,'verify-email?'+new URLSearchParams({token:query.data.token,callbackURL:target}))
   if(response.status>=300 && response.status<400) {
    const location=response.headers.get('location');if(!location)throw unavailable()
    const redirect=new URL(location,target)
    if(redirect.origin!==options.origin || redirect.pathname!=='/login' || redirect.hash || [...redirect.searchParams.keys()].some(key=>key!=='error'))throw unavailable()
    setCookies(response,res)
    // Never reflect arbitrary upstream query values or verification tokens.
    res.redirect(303,target+(redirect.searchParams.has('error')?'?error=verification_failed':''));return
   }
   if(response.status>=500)throw unavailable()
   if(!response.ok)throw new HttpError(400,'Ссылка подтверждения недействительна')
   setCookies(response,res);res.redirect(303,target);return
  }
  if(Object.keys(req.query).length)throw new HttpError(400,'Параметры не поддерживаются')
  if(req.method==='GET' && path==='get-session'){res.json(await liveSession(req,options,res));return}
  if(req.method!=='POST' || !Object.hasOwn(bodies,path)){res.status(404).json({error:'Маршрут не найден'});return}
  if(Buffer.byteLength(JSON.stringify(req.body ?? {}))>16384)throw new HttpError(413,'Запрос слишком большой')
  const parsed=bodies[path as keyof typeof bodies].safeParse(req.body)
  if(!parsed.success)throw new HttpError(400,'Проверьте поля формы')
  const body:Record<string,unknown>={...parsed.data}
  if(path==='sign-up/email' || path==='send-verification-email' || body.callbackURL!==undefined)body.callbackURL=approvedCallback(body.callbackURL,options.origin,'/login')
  if(path==='request-password-reset')body.redirectTo=approvedCallback(body.redirectTo,options.origin,'/reset-password')
  const response=await upstream(options,req,path,body)
  if(response.status>=500 || (response.status>=300 && response.status<400))throw unavailable()
  if(!response.ok) {
   const data=await json(response)
   if(typeof data==='object' && data && 'code' in data && data.code==='EMAIL_NOT_VERIFIED'){res.status(403).json({error:'Подтвердите email',code:'EMAIL_NOT_VERIFIED'});return}
   res.status(response.status===429?429:400).json({error:'Не удалось выполнить запрос. Проверьте данные и попробуйте снова.'});return
  }
  setCookies(response,res);res.json({ok:true})
 })
 router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const status=error instanceof HttpError ? error.status : typeof error==='object' && error && 'status' in error && error.status===413 ? 413 : error instanceof SyntaxError ? 400 : 503
  res.status(status).json({error:error instanceof HttpError ? error.message : status===413?'Запрос слишком большой':status===400?'Некорректный JSON':'Сервис входа временно недоступен'})
 })
 return router
}
