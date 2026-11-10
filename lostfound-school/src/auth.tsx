import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import type { Profile } from '../shared/domain'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url,key) : null
const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/,'')
export async function api<T>(token:string,path:string,options:RequestInit={}):Promise<T> {
 const headers=new Headers(options.headers)
 headers.set('Authorization',`Bearer ${token}`)
 if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json')
 const timeout=AbortSignal.timeout(20000)
 const response=await fetch(`${base}${path}`,{...options,headers,signal:options.signal ? AbortSignal.any([options.signal,timeout]) : timeout})
 const result=await response.json().catch(()=>({error:'Сервер вернул некорректный ответ'}))
 if(!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос')
 return result as T
}
type Auth = { session:Session|null; profile:Profile|null; loading:boolean; error:string; retry:()=>void }
const Context=createContext<Auth>({session:null,profile:null,loading:true,error:'',retry:()=>{}})
export function AuthProvider({children}:{children:ReactNode}) {
 const [session,setSession]=useState<Session|null>(null),[profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(Boolean(supabase)),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 useEffect(()=>{
  if(!supabase)return
  let active=true, eventReceived=false
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{eventReceived=true;if(active)setSession(next)})
  supabase.auth.getSession().then(({data,error})=>{if(active&&!eventReceived){setSession(data.session);if(error)setError('Не удалось восстановить вход')}}).catch(()=>{if(active)setError('Не удалось восстановить вход')}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false;data.subscription.unsubscribe()}
 },[])
 useEffect(()=>{
  setProfile(null);setError('')
  if(!session){setLoading(false);return}
  const controller=new AbortController();setLoading(true)
  api<Profile>(session.access_token,'/me',{signal:controller.signal}).then(setProfile).catch(e=>{if(!controller.signal.aborted)setError(message(e))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[session,attempt])
 return <Context.Provider value={{session,profile,loading,error,retry:()=>setAttempt(x=>x+1)}}>{children}</Context.Provider>
}
export const useAuth=()=>useContext(Context)
export function message(error:unknown){return error instanceof Error?error.message:'Не удалось выполнить действие'}
