import { AlertCircle, Clock3 } from 'lucide-react'

export function Feedback({ error }: { error: string }) {
  return error ? <p className="feedback error" role="alert"><AlertCircle size={20} aria-hidden="true" />{error}</p> : null
}

export function Loading() {
  return <div className="container empty-state" role="status" aria-live="polite"><Clock3 size={26} aria-hidden="true" /><p>Загрузка…</p></div>
}
