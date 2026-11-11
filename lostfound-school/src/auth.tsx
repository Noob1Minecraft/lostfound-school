import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Profile } from '../shared/domain'
export const neonAuth = import.meta.env.VITE_AUTH_PROVIDER === 'neon'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = !neonAuth && url && key ? createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null
export const authConfigured = neonAuth || Boolean(supabase)
export type AuthSession = { access_token?: string; user: { id:string; email?:string; name?:string } }
const base = neonAuth ? '/api' : (import.meta.env.VITE_API_URL || '/api').replace(/\/$/,'')
export async function api<T>(token:string|undefined,path:string,options:RequestInit={}):Promise<T> {
 const headers=new Headers(options.headers)
 if(!neonAuth && token)headers.set('Authorization',`Bearer ${token}`)
 if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json')
 const timeout=AbortSignal.timeout(20000)
 const response=await fetch(`${base}${path}`,{...options,credentials:'same-origin',headers,signal:options.signal ? AbortSignal.any([options.signal,timeout]) : timeout})
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Школьный сервис недоступен. Попробуй позже или обратись к сотруднику школы.')
 const result=await response.json().catch(()=>{throw new Error('Школьный сервис вернул некорректный ответ. Попробуй позже.')})
 if(neonAuth && response.status===401 && !path.startsWith('/auth/'))window.dispatchEvent(new Event('school-auth-expired'))
 if(!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос'),{code:result.code})
 return result as T
}
async function managedAuth(path:string,body?:object){return api(undefined,`/auth/${path}`,body ? {method:'POST',body:JSON.stringify(body)} : {})}
const authChannel=neonAuth && typeof BroadcastChannel!=='undefined' ? new BroadcastChannel('school-auth') : null
const changed=()=>{window.dispatchEvent(new Event('school-auth-change'));authChannel?.postMessage('changed')}
export const authClient = {
 async signIn(email:string,password:string){if(neonAuth){await managedAuth('sign-in/email',{email,password});changed()}else{const result=await supabase!.auth.signInWithPassword({email,password});if(result.error)throw result.error}},
 async signUp(email:string,password:string,name:string){const callbackURL=`${location.origin}/login`;if(neonAuth){await managedAuth('sign-up/email',{email,password,name,callbackURL});changed()}else{const result=await supabase!.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:callbackURL}});if(result.error)throw result.error}},
 async forgot(email:string){const redirectTo=`${location.origin}/reset-password`;if(neonAuth)await managedAuth('request-password-reset',{email,redirectTo});else{const result=await supabase!.auth.resetPasswordForEmail(email,{redirectTo});if(result.error)throw result.error}},
 async reset(password:string,token:string){if(neonAuth)await managedAuth('reset-password',{newPassword:password,token});else{const result=await supabase!.auth.updateUser({password});if(result.error)throw result.error}},
 async signOut(){if(neonAuth){await managedAuth('sign-out',{});changed()}else{const result=await supabase!.auth.signOut();if(result.error)throw result.error}},
 async verifyEmail(email:string,otp:string){await managedAuth('email-otp/verify-email',{email,otp})},
 async resendVerification(email:string){await managedAuth('email-otp/send-verification-otp',{email,type:'email-verification'})},
}
type Auth = { session:AuthSession|null; profile:Profile|null; loading:boolean; error:string; recovering:boolean; retry:()=>void }
const Context=createContext<Auth>({session:null,profile:null,loading:true,error:'',recovering:false,retry:()=>{}})
export function AuthProvider({children}:{children:ReactNode}) {
 const [session,setSession]=useState<AuthSession|null>(null)
 const [profile,setProfile]=useState<Profile|null>(null)
 const [initialized,setInitialized]=useState(!authConfigured)
 const [profileLoading,setProfileLoading]=useState(false)
 const [sessionError,setSessionError]=useState('')
 const [profileError,setProfileError]=useState('')
 const [recovering,setRecovering]=useState(false)
 const [attempt,setAttempt]=useState(0)
 const sessionRef=useRef(session)
 sessionRef.current=session
 useEffect(()=>{
  if(neonAuth){
   let active=true, generation=0, refreshing=false
   const clear=()=>{setSession(null);setProfile(null);setProfileLoading(false);setSessionError('');setProfileError('')}
   const reload=()=>{active=false;clear();setInitialized(false);setAttempt(x=>x+1)}
   const expired=()=>{active=false;clear();setInitialized(true)}
   const revalidate=async()=>{
    if(!active || refreshing || !sessionRef.current)return
    refreshing=true;const requestGeneration=++generation
    try{
     const next=await api<AuthSession|null>(undefined,'/auth/get-session')
     if(!active || requestGeneration!==generation)return
     if(!next){clear();setInitialized(true)}
     else if(next.user.id!==sessionRef.current?.user.id){clear();setSession(next);setProfileLoading(true)}
     // An unchanged identity keeps mounted forms and unsaved files intact.
    }catch{/* Background transport failure is retried on the next focus; business calls still enforce auth. */}
    finally{refreshing=false}
   }
   const visible=()=>{if(document.visibilityState==='visible')void revalidate()}
   window.addEventListener('school-auth-change',reload)
   window.addEventListener('school-auth-expired',expired)
   window.addEventListener('focus',revalidate)
   document.addEventListener('visibilitychange',visible)
   authChannel?.addEventListener('message',reload)
   setInitialized(false);setSessionError('')
   api<AuthSession|null>(undefined,'/auth/get-session').then(next=>{if(active){setSession(next);setProfileLoading(Boolean(next))}}).catch(()=>{if(active){setSession(null);setProfile(null);setSessionError('Не удалось восстановить вход. Попробуй снова.')}}).finally(()=>{if(active)setInitialized(true)})
   return()=>{active=false;window.removeEventListener('school-auth-change',reload);window.removeEventListener('school-auth-expired',expired);window.removeEventListener('focus',revalidate);document.removeEventListener('visibilitychange',visible);authChannel?.removeEventListener('message',reload)}
  }
  if(!supabase)return
  let active=true, eventReceived=false
  const {data}=supabase.auth.onAuthStateChange((event,next)=>{
   eventReceived=true
   if(!active)return
   setSession(next);setProfile(null);setProfileLoading(Boolean(next));setSessionError('');setInitialized(true)
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
  api<Profile>(session.access_token,'/me',{signal:controller.signal}).then(profile=>{if(!controller.signal.aborted)setProfile(profile)})
   .catch(e=>{if(!controller.signal.aborted)setProfileError(message(e))})
   .finally(()=>{if(!controller.signal.aborted)setProfileLoading(false)})
  return()=>controller.abort()
 },[session,attempt])
 return <Context.Provider value={{session,profile,loading:!initialized||profileLoading,error:sessionError||profileError,recovering,retry:()=>setAttempt(x=>x+1)}}>{children}</Context.Provider>
}
export const useAuth=()=>useContext(Context)
export function message(error:unknown){return error instanceof Error?error.message:'Не удалось выполнить действие'}
