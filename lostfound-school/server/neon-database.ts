import { Pool } from 'pg'
import type { Item, Profile } from '../shared/domain.ts'
import type { Store } from './store.ts'
import { HttpError } from './errors.ts'
import { assertRequestActive } from './request-context.ts'

export interface ImageStore {
 put(path: string, bytes: Buffer): Promise<void>
 remove(path: string): Promise<void>
 sign(path: string): Promise<string>
}
export interface DatabaseClient {
 query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
 release(): void
}
export interface DatabasePool { connect(): Promise<DatabaseClient> }
export interface VerifiedIdentity { id: string; email: string; name?: string }
function failure(error: unknown): never {
 if(error instanceof HttpError)throw error
 const code=(error as {code?:string})?.code
 if(code==='42501')throw new HttpError(403,'Доступ к школе не подтверждён или недостаточно прав')
 if(code==='P0002')throw new HttpError(404,'Запись не найдена')
 if(code==='23505'||code==='P0001')throw new HttpError(409,'Состояние изменилось. Обновите страницу.')
 if(code?.startsWith('22')||code==='23514'||code==='23502')throw new HttpError(400,'Проверьте введённые данные')
 throw new HttpError(503,'Хранилище временно недоступно')
}
export function createNeonDatabase(connectionString: string) {
 const pool=new Pool({connectionString,max:3,connectionTimeoutMillis:5_000,idleTimeoutMillis:30_000})
 // Idle socket errors must not become uncaught exceptions or log connection secrets.
 pool.on('error',()=>{})
 return {...createNeonDatabaseWithPool(pool),close:()=>pool.end()}
}
/** Injection seam for real PostgreSQL-compatible test engines. Never exposed through HTTP. */
export function createNeonDatabaseWithPool(pool: DatabasePool) {
 async function transaction<T>(role:'school_app'|'school_identity',id:string|null,run:(client:DatabaseClient)=>Promise<T>):Promise<T>{
  let client:DatabaseClient|undefined
  try{
   assertRequestActive()
   client=await pool.connect()
   assertRequestActive()
   await client.query('BEGIN')
   // Role names are constants, not request input. Owners are downgraded before any business SQL.
   await client.query(role==='school_app'?'SET LOCAL ROLE school_app':'SET LOCAL ROLE school_identity')
   const roles=await client.query("select r.rolsuper,r.rolbypassrls,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relowner=r.oid) as owns_tables from pg_roles r where r.rolname=current_user")
   if(roles.rows.length!==1||roles.rows[0].rolsuper||roles.rows[0].rolbypassrls||roles.rows[0].owns_tables)throw new HttpError(503,'Небезопасная роль базы данных')
   await client.query("select set_config('school.user_id',$1,true)",[id??''])
   await client.query("set local statement_timeout='8s'")
   await client.query("set local lock_timeout='5s'")
   await client.query("set local idle_in_transaction_session_timeout='10s'")
   assertRequestActive()
   const result=await run(client)
   assertRequestActive()
   await client.query('COMMIT')
   return result
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return failure(error)}
  finally{client?.release()}
 }
 async function value<T>(role:'school_app'|'school_identity',id:string|null,sql:string,params:unknown[]=[]):Promise<T>{
  return transaction(role,id,async client=>(await client.query(sql,params)).rows[0]?.result as T)
 }
 return {
  // The managed-auth adapter must verify the session and email before calling this server-only method.
  resolveIdentity(identity:VerifiedIdentity):Promise<Profile>{
   return value('school_identity',null,'select to_jsonb(private.provision_identity($1,$2,$3)) as result',[identity.id,identity.email,identity.name??'Ученик'])
  },
  store(profile:Profile,images?:ImageStore):Store{
   const rpc=<T>(fn:string,params:unknown[]=[])=>value<T>('school_app',profile.id,`select to_jsonb(private.${fn}(${params.map((_,i)=>'$'+(i+1)).join(',')})) as result`,params)
   async function withImage(item:Item):Promise<Item>{
    if(!item.image_path)return item
    if(!images)throw new HttpError(503,'Хранилище изображений не настроено')
    return {...item,image_url:await images.sign(item.image_path)}
   }
   const itemRpc=async(fn:string,params:unknown[])=>withImage(await rpc<Item>(fn,params))
   return {
    consumeRateLimit:scope=>rpc('consume_api_rate_limit',[scope]),
    async listItems(){const rows=await value<Item[]>('school_app',profile.id,"select coalesce(jsonb_agg(t order by t.created_at desc,t.id),'[]') as result from public.items t");return Promise.all(rows.map(withImage))},
    async getItem(id){const row=await value<Item|null>('school_app',profile.id,'select to_jsonb(t) as result from public.items t where id=$1',[id]);return row?withImage(row):null},
    saveItem:(id,input)=>itemRpc('save_item',[id,input]),
    moderate:(id,status)=>itemRpc('moderate_item',[id,status]),
    closeItem:id=>itemRpc('close_item',[id]),
    listClaims:()=>value('school_app',profile.id,"select coalesce(jsonb_agg(t order by t.created_at desc,t.id),'[]') as result from public.claims t"),
    createClaim:input=>rpc('submit_claim',[input.lost_item_id,input.found_item_id,input.evidence]),
    reviewClaim:(id,status,note)=>rpc('review_claim',[id,status,note]),
    stats:()=>rpc('admin_stats'),
    listMembers:()=>rpc('list_members'),
    manageMember:input=>rpc('manage_member',[input.email,input.role??null,input.active??null]),
    async upload(id,owner,bytes){
     if(!images)throw new HttpError(503,'Хранилище изображений не настроено')
     if(owner!==profile.id)throw new HttpError(403,'Недостаточно прав')
     const row=await value<Item|null>('school_app',profile.id,'select to_jsonb(t) as result from public.items t where id=$1',[id])
     if(!row||row.owner_id!==profile.id)throw new HttpError(403,'Недостаточно прав')
     const path=`${profile.id}/${id}/${crypto.randomUUID()}.webp`
     await images.put(path,bytes)
     let attached:Item
     try{attached=await rpc<Item>('attach_image',[id,path])}catch(error){await images.remove(path).catch(()=>{console.warn('Neon object cleanup failed; operator orphan sweep required')});throw error}
     // Replacement cleanup is best effort; never remove the newly linked image if signing fails.
     if(row.image_path && row.image_path!==attached.image_path)await images.remove(row.image_path).catch(()=>{console.warn('Neon object cleanup failed; operator orphan sweep required')})
     return withImage(attached)
    },
   }
  },
 }
}
