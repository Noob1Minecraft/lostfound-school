import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Claim, Item, ItemInput, Profile } from '../shared/domain.ts'
import { HttpError } from './errors.ts'
import { boundedFetch } from './request-context.ts'
export interface Store {
  consumeRateLimit(scope: 'read' | 'write'): Promise<boolean>
  listItems(): Promise<Item[]>; getItem(id: string): Promise<Item | null>
  saveItem(id: string | null, input: Partial<ItemInput>): Promise<Item>
  moderate(id: string, status: string): Promise<Item>
  listClaims(): Promise<Claim[]>; createClaim(input: { lost_item_id: string; found_item_id: string; evidence: string }): Promise<Claim>
  reviewClaim(id: string, status: string, note: string): Promise<Claim>
  stats(): Promise<Record<string, number>>
  upload(id: string, owner: string, bytes: Buffer): Promise<Item>
}
function checked<T>(result: { data: T; error: { code?: string; message?: string } | null }): T {
  if (result.error) {
    const code = result.error.code
    if (code === '42501') throw new HttpError(403, 'Недостаточно прав')
    if (code === 'P0002') throw new HttpError(404, 'Запись не найдена')
    if (code === '23505' || code === 'P0001') throw new HttpError(409, 'Состояние изменилось или заявка уже существует. Обновите страницу.')
    if (code?.startsWith('22') || code === '23514' || code === '23502') throw new HttpError(400, 'Проверьте введённые данные')
    throw new HttpError(503, 'Хранилище временно недоступно')
  }
  return result.data
}
export function supabaseStore(db: SupabaseClient, storageAdmin?: SupabaseClient): Store {
  async function withImage(item: Item): Promise<Item> {
    if (!item.image_path) return item
    const data = checked(await db.storage.from('item-images').createSignedUrl(item.image_path, 600))
    if(!data?.signedUrl)throw new HttpError(503,'Хранилище временно недоступно')
    return { ...item, image_url: data.signedUrl }
  }
  async function rpcItem(name: string, params: Record<string, unknown>) { return withImage(checked(await db.rpc(name, params)) as Item) }
  return {
    async consumeRateLimit(scope) { return checked(await db.rpc('consume_api_rate_limit', { p_scope: scope })) === true },
    async listItems() {
      // Page through PostgREST's default 1000-row cap; school catalogs must not silently truncate.
      const rows: Item[] = []
      for (let offset = 0; ; offset += 500) {
        const page = checked(await db.from('items').select('*').order('created_at', {ascending:false}).order('id').range(offset,offset+499)) as Item[]
        rows.push(...page)
        if (page.length < 500) break
      }
      return Promise.all(rows.map(withImage))
    },
    async getItem(id) { const row = checked(await db.from('items').select('*').eq('id',id).maybeSingle()) as Item | null; return row ? withImage(row) : null },
    saveItem: (id,input) => rpcItem('save_item', { p_id:id, p_input:input }),
    moderate: (id,status) => rpcItem('moderate_item', { p_id:id, p_status:status }),
    async listClaims() {
      const rows: Claim[] = []
      for (let offset=0; ; offset+=500) {
        const page=checked(await db.from('claims').select('*').order('created_at',{ascending:false}).order('id').range(offset,offset+499)) as Claim[]
        rows.push(...page)
        if(page.length<500) break
      }
      return rows
    },
    async createClaim(input) { return checked(await db.rpc('submit_claim',{ p_lost:input.lost_item_id, p_found:input.found_item_id, p_evidence:input.evidence })) as Claim },
    async reviewClaim(id,status,note) { return checked(await db.rpc('review_claim',{p_id:id,p_status:status,p_note:note})) as Claim },
    async stats() { return checked(await db.rpc('admin_stats')) as Record<string,number> },
    async upload(id, owner, bytes) {
      if (!storageAdmin) throw new HttpError(503,'Загрузка фото ещё не настроена администратором')
      const path = `${owner}/${id}/${crypto.randomUUID()}.webp`
      checked(await storageAdmin.storage.from('item-images').upload(path,bytes,{contentType:'image/webp',upsert:false}))
      let attached:Item
      try { attached=checked(await db.rpc('attach_image',{p_id:id,p_path:path})) as Item }
      catch (error) { await storageAdmin.storage.from('item-images').remove([path]); throw error }
      // Signing failure must never delete an object that the database already linked.
      return withImage(attached)
    },
  }
}
export function makeAuthenticator(url: string, key: string, storageKey?: string) {
  const auth = createClient(url,key,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false}})
  // Privileged client is confined to storage writes. All SQL calls use the user's JWT.
  const storageAdmin = storageKey ? createClient(url,storageKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false}}) : undefined
  return async (token: string) => {
    const { data, error } = await auth.auth.getUser(token)
    if (error && (!error.status || error.status >= 500)) throw new HttpError(503,'Сервис входа временно недоступен')
    if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) return null
    const db = createClient(url,key,{global:{fetch:boundedFetch,headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
    const profile = checked(await db.from('profiles').select('id,display_name,role').eq('id',data.user.id).maybeSingle()) as Profile | null
    if (!profile) throw new HttpError(403,'Доступ к школе ещё не подтверждён. Обратитесь к администратору.')
    return {profile, store:supabaseStore(db,storageAdmin)}
  }
}
