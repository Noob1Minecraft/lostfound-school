import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import type { Profile } from '../shared/domain'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null
const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/,'')
export async function api<T>(token:string,path:string,options:RequestInit={}):Promise<T> {
 const headers=new Headers(options.headers)
 headers.set('Authorization',`Bearer ${token}`)
 if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json')
 const timeout=AbortSignal.timeout(20000)
 const response=await fetch(`${base}${path}`,{...options,headers,signal:options.signal ? AbortSignal.any([options.signal,timeout]) : timeout})
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Школьный сервис недоступен. Попробуй позже или обратись к сотруднику школы.')
 const result=await response.json().catch(()=>{throw new Error('Школьный сервис вернул некорректный ответ. Попробуй позже.')})
 if(!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос')
 return result as T
}
type Auth = { session:Session|null; profile:Profile|null; loading:boolean; error:string; recovering:boolean; retry:()=>void }
const Context=createContext<Auth>({session:null,profile:null,loading:true,error:'',recovering:false,retry:()=>{}})
export function AuthProvider({children}:{children:ReactNode}) {
 const [session,setSession]=useState<Session|null>(null)
 const [profile,setProfile]=useState<Profile|null>(null)
 const [initialized,setInitialized]=useState(!supabase)
 const [profileLoading,setProfileLoading]=useState(false)
 const [sessionError,setSessionError]=useState('')
 const [profileError,setProfileError]=useState('')
 const [recovering,setRecovering]=useState(false)
 const [attempt,setAttempt]=useState(0)
 useEffect(()=>{
  if(!supabase)return
  let active=true, eventReceived=false
  const {data}=supabase.auth.onAuthStateChange((event,next)=>{
   eventReceived=true
   if(!active)return
   setSession(next)
   setProfile(null)
   setProfileLoading(Boolean(next))
   setSessionError('')
   setInitialized(true)
   if(event==='PASSWORD_RECOVERY')setRecovering(true)
   if(event==='SIGNED_OUT')setRecovering(false)
  })
  supabase.auth.getSession().then(({data,error})=>{
   if(active&&!eventReceived){setSession(data.session);setProfileLoading(Boolean(data.session));if(error)setSessionError('Не удалось восстановить вход. Попробуй снова.')}
  }).catch(()=>{if(active)setSessionError('Не удалось восстановить вход. Проверь подключение.')}).finally(()=>{if(active)setInitialized(true)})
  return()=>{active=false;data.subscription.unsubscribe()}
 },[attempt])
 useEffect(()=>{
  setProfile(null);setProfileError('')
  if(!session){setProfileLoading(false);return}
  const controller=new AbortController();setProfileLoading(true)
  api<Profile>(session.access_token,'/me',{signal:controller.signal}).then(setProfile)
   .catch(e=>{if(!controller.signal.aborted)setProfileError(message(e))})
   .finally(()=>{if(!controller.signal.aborted)setProfileLoading(false)})
  return()=>controller.abort()
 },[session,attempt])
 return <Context.Provider value={{session,profile,loading:!initialized||profileLoading,error:sessionError||profileError,recovering,retry:()=>setAttempt(x=>x+1)}}>{children}</Context.Provider>
}
export const useAuth=()=>useContext(Context)
export function message(error:unknown){return error instanceof Error?error.message:'Не удалось выполнить действие'}
