import { z } from 'zod'
import { categories, colors, locations } from '../shared/domain.ts'
export const uuid = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(+d) && d.toISOString().slice(0,10) === s && s <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qyzylorda' }) }, 'Некорректная дата')
export const itemInput = z.object({ type:z.enum(['lost','found']), title:z.string().trim().min(3).max(80), category:z.enum(categories), color:z.enum(colors), location:z.enum(locations), date, description:z.string().trim().min(5).max(400) }).strict()
export const itemPatch = itemInput.partial().refine(o => Object.keys(o).length > 0, 'Нет изменений')
export const claimInput = z.object({ lost_item_id:uuid, found_item_id:uuid, evidence:z.string().trim().min(10).max(1000) }).strict()
export const claimReview = z.object({ status:z.enum(['approved','rejected','returned']), admin_note:z.string().trim().max(500).default('') }).strict()
export const moderation = z.object({ status:z.enum(['approved','rejected']) }).strict()
export const membership = z.object({email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),role:z.enum(['student','admin']).optional(),active:z.boolean().optional()}).strict().refine(x=>x.role!==undefined||x.active!==undefined,'Нет изменений')
