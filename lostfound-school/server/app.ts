import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import sharp from 'sharp'
import { ZodError } from 'zod'
import type { Profile } from '../shared/domain.ts'
import { explainMatch } from '../shared/matching.ts'
import { claimInput, claimReview, itemInput, itemPatch, moderation, uuid } from './validation.ts'
import type { Store } from './store.ts'
import { HttpError } from './errors.ts'
import { MAX_IMAGE_BYTES } from '../shared/limits.ts'
import { assertRequestActive, privateResponses, requestDeadline } from './request-context.ts'
export type AuthContext = { profile: Profile; store: Store }
type Options = { origin: string; authenticate: (token: string) => Promise<AuthContext | null>; trustProxy?: number; requestTimeoutMs?: number; distributedRateLimit?: boolean }
export function createApp(options: Options) {
  const app = express()
  app.disable('x-powered-by')
  app.disable('etag')
  app.use(privateResponses, requestDeadline(options.requestTimeoutMs))
  app.use((req,_res,next) => {
    if (Number(req.headers['content-length']) > 4_200_000) throw new HttpError(413,'Запрос слишком большой')
    next()
  })
  if (options.trustProxy) app.set('trust proxy', options.trustProxy)
  app.use(helmet(), cors({ origin(origin,cb) { cb(origin && origin !== options.origin ? new HttpError(403,'Источник запроса запрещён') : null, options.origin) } }))
  app.use(express.json({limit:'32kb'}))
  app.get('/api/health', (_req,res) => res.json({status:'ok'}))
  app.use('/api', rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуйте через минуту.'}}))
  app.use('/api', async (req,res,next) => {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]
    const auth = token ? await options.authenticate(token) : null
    assertRequestActive()
    if (!auth) throw new HttpError(401,'Войдите и подтвердите email')
    res.locals.auth = auth
    next()
  })
  const context = (res:Response) => res.locals.auth as AuthContext
  const admin = (_req:Request,res:Response,next:NextFunction) => { if (context(res).profile.role !== 'admin') throw new HttpError(403,'Требуются права администратора'); next() }
  const localWrites = rateLimit({windowMs:60_000,limit:20,keyGenerator:(_req,res)=>context(res).profile.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много изменений. Попробуйте через минуту.'}})
  const sharedLimit = (scope: 'read' | 'write') => async (_req:Request,res:Response,next:NextFunction) => {
    const store = context(res).store
    if (!store.consumeRateLimit) throw new HttpError(503,'Ограничение запросов ещё не настроено')
    const allowed = await store.consumeRateLimit(scope)
    assertRequestActive()
    if (!allowed) { res.set('Retry-After','60'); throw new HttpError(429,'Слишком много запросов. Попробуйте через минуту.') }
    next()
  }
  if (options.distributedRateLimit) app.use('/api', sharedLimit('read'))
  const writes = options.distributedRateLimit ? sharedLimit('write') : localWrites
  app.get('/api/me', (_req,res) => res.json(context(res).profile))
  app.get('/api/items', async (_req,res) => res.json(await context(res).store.listItems()))
  app.get('/api/items/:id', async (req,res) => { const row = await context(res).store.getItem(uuid.parse(req.params.id)); if (!row) throw new HttpError(404,'Объявление не найдено'); res.json(row) })
  app.post('/api/items', writes, async (req,res) => res.status(201).json(await context(res).store.saveItem(null,itemInput.parse(req.body))))
  app.patch('/api/items/:id', writes, async (req,res) => {
    const id = uuid.parse(req.params.id), input = itemPatch.parse(req.body), {store,profile} = context(res)
    const row = await store.getItem(id)
    if (!row) throw new HttpError(404,'Объявление не найдено')
    if (row.owner_id !== profile.id) throw new HttpError(403,'Можно редактировать только свои объявления')
    if (row.status === 'returned') throw new HttpError(409,'Вещь уже возвращена')
    res.json(await store.saveItem(id,input))
  })
  app.get('/api/matches', async (_req,res) => {
    const rows = (await context(res).store.listItems()).filter(x=>x.status==='approved')
    const found = rows.filter(x=>x.type==='found')
    const pairs = rows.filter(x=>x.type==='lost').flatMap(a=>found.map(b=>({a,b,...explainMatch(a,b)}))).filter(x=>x.score>=40).sort((a,b)=>b.score-a.score || a.a.id.localeCompare(b.a.id) || a.b.id.localeCompare(b.b.id))
    res.json(pairs)
  })
  app.get('/api/claims', async (_req,res) => res.json(await context(res).store.listClaims()))
  app.post('/api/claims', writes, async (req,res) => res.status(201).json(await context(res).store.createClaim(claimInput.parse(req.body))))
  app.use('/api/admin',admin)
  app.get('/api/admin/claims', async (_req,res) => res.json(await context(res).store.listClaims()))
  app.patch('/api/admin/claims/:id', writes, async (req,res) => { const input = claimReview.parse(req.body); res.json(await context(res).store.reviewClaim(uuid.parse(req.params.id),input.status,input.admin_note)) })
  app.patch('/api/admin/items/:id', writes, async (req,res) => res.json(await context(res).store.moderate(uuid.parse(req.params.id),moderation.parse(req.body).status)))
  app.get('/api/admin/stats', async (_req,res) => res.json(await context(res).store.stats()))
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_IMAGE_BYTES,files:1,fields:0,parts:1,headerPairs:50},fileFilter:(_req,file,cb)=> { if (!['image/jpeg','image/png','image/webp'].includes(file.mimetype)) return cb(new HttpError(400,'Допустимы JPEG, PNG и WebP')); cb(null,true) }})
  app.post('/api/items/:id/image', writes, upload.single('image'), async (req,res) => {
    const id = uuid.parse(req.params.id), {store,profile} = context(res)
    const row = await store.getItem(id)
    if (!row) throw new HttpError(404,'Объявление не найдено')
    if (row.owner_id !== profile.id) throw new HttpError(403,'Можно изменять только свои объявления')
    if (!req.file) throw new HttpError(400,'Выберите фотографию')
    let bytes:Buffer
    try { bytes = await sharp(req.file.buffer,{limitInputPixels:20_000_000,animated:false}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).timeout({seconds:8}).toBuffer() } catch { throw new HttpError(400,'Не удалось прочитать изображение') }
    assertRequestActive()
    res.json(await store.upload(id,profile.id,bytes))
  })
  app.use((_req,_res,next)=>next(new HttpError(404,'Маршрут не найден')))
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=> {
    if (res.headersSent || res.writableEnded) return
    if (error instanceof ZodError) return res.status(400).json({error:'Проверьте поля формы',fields:error.flatten().fieldErrors})
    if (error instanceof multer.MulterError) return res.status(400).json({error:'Один файл, не более 4 МБ'})
    if (error instanceof HttpError) return res.status(error.status).json({error:error.message})
    if (error instanceof SyntaxError) return res.status(400).json({error:'Некорректный JSON'})
    if (typeof error === 'object' && error && 'status' in error && error.status === 413) return res.status(413).json({error:'Запрос слишком большой'})
    res.status(500).json({error:'Временная ошибка сервера'})
  })
  return app
}
