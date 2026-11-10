import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Menu, Plus, X, ShieldCheck, LayoutDashboard, Clock3, CircleCheck, LogOut } from 'lucide-react'
import { api, AuthProvider, message, supabase, useAuth } from './auth'
import { Catalog, ItemCard, Landing, Mark, NotFound } from './catalog'
import { ItemDetails, ItemForm } from './items'
import { Admin, Claims, Matches } from './workflows'
import { AuthPage } from './AuthPage'
import { Feedback, Loading } from './ui'
import type { Item } from '../shared/domain'

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
 const [menu,setMenu]=useState(false),[error,setError]=useState(''),[loggingOut,setLoggingOut]=useState(false),auth=useAuth(),location=useLocation(),menuButton=useRef<HTMLButtonElement>(null)
 useEffect(()=>setMenu(false),[location.pathname])
 useEffect(()=>{if(!menu)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);menuButton.current?.focus()}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[menu])
 async function logout(){setError('');setLoggingOut(true);try{const result=await supabase?.auth.signOut();if(result?.error)throw result.error}catch{setError('Не удалось выйти. Проверь подключение и попробуй снова.')}finally{setLoggingOut(false)}}
 return <><a className="skip-link" href="#main">Перейти к содержимому</a><header className="site-header"><div className="container header-inner"><Mark small/><nav id="navigation" aria-label="Основная навигация" className={menu?'nav-links nav-open':'nav-links'}><NavLink end to="/app">Каталог</NavLink><NavLink to="/app/dashboard">Мой кабинет</NavLink><NavLink to="/app/matches">Совпадения</NavLink><NavLink to="/app/my-items">Мои объявления</NavLink>{auth.profile?.role==='admin'&&<NavLink to="/admin">Администратор</NavLink>}</nav><div className="header-actions">{auth.session?<button className="btn btn-white" disabled={loggingOut} onClick={logout}><LogOut size={16} aria-hidden="true"/>{loggingOut?'Выход…':'Выйти'}</button>:<Link className="btn btn-primary" to="/login">Войти</Link>}<button ref={menuButton} className="icon-btn mobile-menu" aria-label={menu?'Закрыть меню':'Открыть меню'} aria-expanded={menu} aria-controls="navigation" onClick={()=>setMenu(!menu)}>{menu?<X aria-hidden="true"/>:<Menu aria-hidden="true"/>}</button></div></div><Feedback error={error}/></header></>
}
function SchoolApp(){
 const location=useLocation(),auth=useAuth(),[items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const token=auth.session?.access_token??''
 const refresh=()=>setRevision(x=>x+1)
 useEffect(()=>{setItems([]);setError('');if(!auth.profile||!token)return;const controller=new AbortController();setLoading(true);api<Item[]>(token,'/items',{signal:controller.signal}).then(setItems).catch(e=>{if(!controller.signal.aborted)setError(message(e))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[token,auth.profile,revision])
 const mine=items.filter(x=>x.owner_id===auth.profile?.id)
 function data(children:ReactNode){return <Gate>{loading?<Loading/>:error?<div className="container empty-state"><Feedback error={error}/><button className="btn btn-primary" onClick={refresh}>Повторить</button></div>:children}</Gate>}
 if(auth.recovering&&location.pathname!=='/reset-password')return <Navigate to="/reset-password" replace/>
 return <div className="app-shell"><Header/><div className="safety-banner"><ShieldCheck size={16} aria-hidden="true"/>Возвращайте вещи через ответственного сотрудника школы. Не публикуйте личные контакты.</div><main id="main"><Routes>
 <Route path="/" element={<Landing/>}/><Route path="/login" element={<AuthPage key="login" mode="login"/>}/><Route path="/register" element={<AuthPage key="register" mode="register"/>}/>
 <Route path="/forgot-password" element={<AuthPage key="forgot" mode="forgot"/>}/><Route path="/reset-password" element={<AuthPage key="reset" mode="reset"/>}/>
 <Route path="/app" element={data(<Catalog items={items.filter(x=>x.status==='approved')}/>)}/>
 <Route path="/app/dashboard" element={data(<div className="container page-content"><div className="page-heading"><div><span className="eyebrow">МОЙ КАБИНЕТ</span><h1>Привет, {auth.profile?.display_name}</h1><p>Объявления, совпадения и возвраты в одном месте.</p></div><Link className="btn btn-primary" to="/app/items/new"><Plus size={18}/> Объявление</Link></div><div className="stat-grid"><div><LayoutDashboard size={22} aria-hidden="true"/><strong>{mine.length}</strong><p>Моих объявлений</p></div><div><Clock3 size={22} aria-hidden="true"/><strong>{mine.filter(x=>x.status==='pending').length}</strong><p>На проверке</p></div><div><CircleCheck size={22} aria-hidden="true"/><strong>{mine.filter(x=>x.status==='returned').length}</strong><p>Возвращено вещей</p></div></div><Claims revision={revision}/></div>)}/>
 <Route path="/app/my-items" element={data(<div className="container page-content"><div className="page-heading"><div><span className="eyebrow">МОИ ОБЪЯВЛЕНИЯ</span><h1>Твои вещи</h1><p>Здесь видны и объявления, которые ещё проверяет школа.</p></div><Link to="/app/items/new" className="btn btn-primary">Новое объявление</Link></div>{mine.length?<div className="item-grid">{mine.map(item=><ItemCard key={item.id} item={item}/>)}</div>:<div className="empty-state"><h2>Здесь пока пусто</h2><p>Добавь потерянную или найденную вещь.</p></div>}</div>)}/>
 <Route path="/app/items/new" element={data(<ItemForm key="new" items={items} onSaved={refresh}/>)}/>
 <Route path="/app/items/:id/edit" element={data(<ItemForm items={items} onSaved={refresh}/>)}/>
 <Route path="/app/items/:id" element={data(<ItemDetails items={items} onChanged={refresh}/>)}/>
 <Route path="/app/matches" element={<Gate><Matches revision={revision}/></Gate>}/>
 <Route path="/admin" element={<Gate admin>{data(<Admin items={items} onChanged={refresh} revision={revision}/>)}</Gate>}/>
 <Route path="*" element={<NotFound/>}/></Routes></main><footer className="footer"><div className="container footer-inner"><Mark small/><span>Lost&Found School · Помогаем вещам вернуться домой</span></div></footer></div>
}
export default function App(){return <AuthProvider><SchoolApp/></AuthProvider>}
