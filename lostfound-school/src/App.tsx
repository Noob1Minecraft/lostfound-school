import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Plus, X } from 'lucide-react'
import { api, AuthProvider, message, supabase, useAuth } from './auth'
import { Catalog, ItemCard, Landing, Mark, NotFound } from './catalog'
import { ItemDetails, ItemForm } from './items'
import { Admin, Claims, Matches } from './workflows'
import type { Item } from '../shared/domain'

export function Feedback({error}:{error:string}) {return error?<p className="feedback error" role="alert">{error}</p>:null}
export function Loading(){return <div className="container empty-state" role="status">Загрузка…</div>}
function Gate({children,admin=false}:{children:ReactNode;admin?:boolean}) {
 const auth=useAuth(),location=useLocation()
 if(auth.loading)return <Loading/>
 if(!auth.session)return <Navigate to="/login" state={{from:location.pathname+location.search}} replace/>
 if(auth.error)return <div className="container empty-state"><Feedback error={auth.error}/><button className="btn btn-primary" onClick={auth.retry}>Повторить</button></div>
 if(!auth.profile)return <Loading/>
 if(admin&&auth.profile.role!=='admin')return <div className="container empty-state"><h1>Доступ ограничен</h1><p>Эта страница доступна сотруднику школы.</p><Link to="/app">В каталог</Link></div>
 return children
}
function Header() {
 const [menu,setMenu]=useState(false),[error,setError]=useState(''),auth=useAuth(),location=useLocation()
 useEffect(()=>setMenu(false),[location.pathname])
 async function logout(){setError('');const result=await supabase?.auth.signOut();if(result?.error)setError('Не удалось выйти. Попробуйте ещё раз.')}
 return <><a className="skip-link" href="#main">Перейти к содержимому</a><header className="site-header"><div className="container header-inner"><Mark small/><nav id="navigation" aria-label="Основная навигация" className={menu?'nav-links nav-open':'nav-links'}><NavLink end to="/app">Каталог</NavLink><NavLink to="/app/dashboard">Мой кабинет</NavLink><NavLink to="/app/matches">Совпадения</NavLink><NavLink to="/app/my-items">Мои объявления</NavLink>{auth.profile?.role==='admin'&&<NavLink to="/admin">Администратор</NavLink>}</nav><div className="header-actions">{auth.session?<button className="btn btn-white" onClick={logout}>Выйти</button>:<Link className="btn btn-primary" to="/login">Войти</Link>}<button className="icon-btn mobile-menu" aria-label={menu?'Закрыть меню':'Открыть меню'} aria-expanded={menu} aria-controls="navigation" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></div><Feedback error={error}/></header></>
}
function Login({register=false}:{register?:boolean}) {
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const auth=useAuth(),navigate=useNavigate(),location=useLocation()
 const from=typeof location.state?.from==='string'&&location.state.from.startsWith('/app')?location.state.from:'/app/dashboard'
 useEffect(()=>{if(auth.profile)navigate(from,{replace:true})},[auth.profile,from,navigate])
 async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError('');setNotice('');try {
  if(register){const {error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{display_name:name.trim()},emailRedirectTo:window.location.origin+'/login'}});if(error)throw error;setNotice('Проверь почту и подтверди email. Доступ к школе выдаёт администратор.')}
  else {const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error}
 }catch{setError(register?'Регистрация не удалась. Проверь данные или попробуй позже.':'Не удалось войти. Проверь email, пароль и подтверждение почты.')}finally{setBusy(false)}}
 return <div className="container narrow-page"><div className="form-panel"><div className="form-heading"><div className="form-symbol">🎓</div><h1>{register?'Добро пожаловать!':'С возвращением!'}</h1><p>{register?'Создай школьный аккаунт':'Войди в школьное бюро находок'}</p></div>{!supabase?<div className="form-note">Подключение к школе ещё не настроено. Администратору нужно заполнить параметры Supabase и API из .env.example.</div>:<form onSubmit={submit}>{register&&<><label className="field-label" htmlFor="name">Имя</label><input id="name" className="field" autoComplete="given-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></>}<label className="field-label" htmlFor="email">Email</label><input id="email" className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/><label className="field-label" htmlFor="password">Пароль {register&&'(не менее 12 символов)'}</label><input id="password" className="field" type="password" autoComplete={register?'new-password':'current-password'} required minLength={register?12:1} value={password} onChange={e=>setPassword(e.target.value)}/><Feedback error={error||auth.error}/>{notice&&<p className="feedback" role="status">{notice}</p>}<button className="btn btn-primary submit-btn" disabled={busy}>{busy?'Подождите…':register?'Зарегистрироваться':'Войти'}</button></form>}<p className="auth-link"><Link to={register?'/login':'/register'}>{register?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}</Link></p></div></div>
}
function SchoolApp(){
 const auth=useAuth(),[items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const token=auth.session?.access_token??''
 const refresh=()=>setRevision(x=>x+1)
 useEffect(()=>{setItems([]);setError('');if(!auth.profile||!token)return;const controller=new AbortController();setLoading(true);api<Item[]>(token,'/items',{signal:controller.signal}).then(setItems).catch(e=>{if(!controller.signal.aborted)setError(message(e))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[token,auth.profile,revision])
 const mine=items.filter(x=>x.owner_id===auth.profile?.id)
 function data(children:ReactNode){return <Gate>{loading?<Loading/>:error?<div className="container empty-state"><Feedback error={error}/><button className="btn btn-primary" onClick={refresh}>Повторить</button></div>:children}</Gate>}
 return <div className="app-shell"><Header/><div className="demo-banner">Возвращайте вещи через ответственного сотрудника школы. Не публикуйте личные контакты.</div><main id="main"><Routes>
 <Route path="/" element={<Landing/>}/><Route path="/login" element={<Login key="login"/>}/><Route path="/register" element={<Login key="register" register/>}/>
 <Route path="/app" element={data(<Catalog items={items.filter(x=>x.status==='approved')}/>)}/>
 <Route path="/app/dashboard" element={data(<div className="container page-content"><div className="page-heading"><div><span className="eyebrow">МОЙ КАБИНЕТ</span><h1>Привет, {auth.profile?.display_name} 👋</h1><p>Объявления, совпадения и возвраты в одном месте.</p></div><Link className="btn btn-primary" to="/app/items/new"><Plus size={18}/> Объявление</Link></div><div className="stat-grid"><div><strong>{mine.length}</strong><p>Моих объявлений</p></div><div><strong>{mine.filter(x=>x.status==='pending').length}</strong><p>На проверке</p></div><div><strong>{mine.filter(x=>x.status==='returned').length}</strong><p>Возвращено вещей</p></div></div><Claims revision={revision}/></div>)}/>
 <Route path="/app/my-items" element={data(<div className="container page-content"><div className="page-heading"><div><span className="eyebrow">МОИ ОБЪЯВЛЕНИЯ</span><h1>Твои вещи 📋</h1><p>Здесь видны и объявления, которые ещё проверяет школа.</p></div><Link to="/app/items/new" className="btn btn-primary">Новое объявление</Link></div>{mine.length?<div className="item-grid">{mine.map(item=><ItemCard key={item.id} item={item}/>)}</div>:<div className="empty-state"><h2>Здесь пока пусто</h2><p>Добавь потерянную или найденную вещь.</p></div>}</div>)}/>
 <Route path="/app/items/new" element={data(<ItemForm key="new" items={items} onSaved={refresh}/>)}/>
 <Route path="/app/items/:id/edit" element={data(<ItemForm items={items} onSaved={refresh}/>)}/>
 <Route path="/app/items/:id" element={data(<ItemDetails items={items} onChanged={refresh}/>)}/>
 <Route path="/app/matches" element={<Gate><Matches revision={revision}/></Gate>}/>
 <Route path="/admin" element={<Gate admin>{data(<Admin items={items} onChanged={refresh} revision={revision}/>)}</Gate>}/>
 <Route path="*" element={<NotFound/>}/></Routes></main><footer className="footer"><div className="container footer-inner"><Mark small/><span>Lost&Found School · Помогаем вещам вернуться домой</span></div></footer></div>
}
export default function App(){return <AuthProvider><SchoolApp/></AuthProvider>}
