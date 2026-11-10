import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Backpack, Check, Filter, Home, MapPin, Plus, Search, ScanSearch, FilePlus2, ShieldCheck, Headphones, School, X } from 'lucide-react'
import { categories, statusLabels, type Item, type ItemType } from '../shared/domain'
import { CategoryIcon } from './icons'
export function formatDate(s:string) {return new Date(s+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}
export function Mark({small=false}:{small?:boolean}) {return <Link to="/" className="brand"><span className={'brand-icon '+(small?'brand-icon-sm':'')}><Backpack size={small?19:23}/></span><span>Lost<span className="brand-accent">&</span>Found <span className="brand-school">School</span></span></Link>}
export function Landing() {
 const steps = [
  { icon: FilePlus2, number: '01', title: 'Расскажи', description: 'Добавь объявление и приметы вещи. Школа проверит публикацию.' },
  { icon: ScanSearch, number: '02', title: 'Найди совпадение', description: 'Сравни похожие вещи. Smart Match объяснит каждое совпадение.' },
  { icon: ShieldCheck, number: '03', title: 'Верни владельцу', description: 'Подтверди приметы и забери вещь через сотрудника школы.' },
 ]
 return <>
  <section className="hero container">
   <div className="hero-copy">
    <span className="eyebrow"><School size={17} aria-hidden="true" /> ШКОЛЬНОЕ БЮРО НАХОДОК</span>
    <h1>Потерял вещь?<br /><span>Найдём вместе.</span></h1>
    <p>Один понятный каталог для потерянных и найденных вещей. Расскажи о потере, сравни приметы и верни своё.</p>
    <div className="hero-actions">
     <Link className="btn btn-primary btn-big" to="/app/items/new?type=lost"><Search size={19} aria-hidden="true" /> Я потерял <ArrowRight size={17} aria-hidden="true" /></Link>
     <Link className="btn btn-white btn-big" to="/app/items/new?type=found"><Plus size={19} aria-hidden="true" /> Я нашёл</Link>
    </div>
    <p className="hero-caption"><ShieldCheck size={20} aria-hidden="true" /> Доступ для участников школы. Возврат через сотрудника.</p>
   </div>
   <div className="hero-art" aria-label="Как работает поиск вещей">
    <div className="art-toolbar"><span className="art-mark"><ScanSearch size={21} aria-hidden="true" /></span><strong>Всё на своём месте</strong><span className="art-label">Обзор</span></div>
    <div className="art-search"><Search size={18} aria-hidden="true" /><span>Найти знакомую вещь</span></div>
    <div className="art-items">
     <div className="art-item"><div className="art-item-icon"><Backpack size={64} strokeWidth={1.4} aria-hidden="true" /></div><span className="art-category">АКСЕССУАРЫ</span><strong>Рюкзак</strong><span className="art-status"><Check size={14} aria-hidden="true" /> Найдено</span></div>
     <div className="art-item"><div className="art-item-icon accent"><Headphones size={64} strokeWidth={1.4} aria-hidden="true" /></div><span className="art-category">ЭЛЕКТРОНИКА</span><strong>Наушники</strong><span className="art-status"><ScanSearch size={14} aria-hidden="true" /> Поиск совпадений</span></div>
    </div>
    <div className="art-footer"><ShieldCheck size={20} aria-hidden="true" /><span>Личные контакты остаются приватными</span></div>
    <span className="art-disclaimer">Схема сервиса — не реальные объявления</span>
   </div>
  </section>
  <section className="container steps-section" aria-labelledby="steps-title"><div className="section-head"><span className="eyebrow">ПОНЯТНО НА КАЖДОМ ШАГЕ</span><h2 id="steps-title">От потери до возврата</h2><p>Без бесконечных сообщений в школьных чатах.</p></div><div className="steps-grid">{steps.map(({icon: Icon, number, title, description})=><article className="step-card" key={number}><div className="step-top"><span className="icon-tile"><Icon size={25} aria-hidden="true" /></span><span className="step-num">{number}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
  <section className="container cta-card"><div><span className="eyebrow">НАЧНИ С КАТАЛОГА</span><h2>Возможно, твою вещь уже нашли</h2><p>Проверь школьные находки или расскажи, что пропало.</p></div><Link to="/app" className="btn btn-primary">Открыть каталог <ArrowRight size={18} aria-hidden="true" /></Link></section>
 </>
}
export function ItemCard({item}:{item:Item}){return <Link to={'/app/items/'+item.id} className="item-card"><div className={'item-visual '+(item.type==='lost'?'visual-lost':'visual-found')}>{item.image_url?<img src={item.image_url} alt={item.title} loading="lazy"/>:<div className="category-art"><CategoryIcon category={item.category}/><span>{item.category}</span></div>}<span className={'item-status '+item.type}>{item.type==='lost'?'Потеряно':'Найдено'}</span></div><div className="item-info"><h3>{item.title}</h3><small className="listing-status">{statusLabels[item.status]}</small><p><MapPin size={14}/>{item.location}</p><div className="item-bottom"><span>{formatDate(item.date)}</span><span className="link-arrow">Подробнее <ArrowRight size={14}/></span></div></div></Link>}
export function Catalog({items}:{items:Item[]}){
 const [query,setQuery]=useState('');const [type,setType]=useState<'all'|ItemType>('all');const [category,setCategory]=useState('all')
 const filtered=useMemo(()=>items.filter(x=>(type==='all'||x.type===type)&&(category==='all'||x.category===category)&&[x.title,x.description,x.location,x.color].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))),[items,query,type,category])
 return <div className="container page-content"><div className="page-heading"><div><span className="eyebrow">НАША ШКОЛА</span><h1>Что ищем сегодня?</h1><p>Все потерянные и найденные вещи в одном месте.</p></div><Link className="btn btn-primary" to="/app/items/new"><Plus size={18}/> Создать объявление</Link></div><div className="search-panel"><div className="search-box"><Search size={21}/><input aria-label="Поиск объявлений" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название, цвет или место"/>{query&&<button className="icon-btn" aria-label="Очистить поиск" onClick={()=>setQuery('')}><X size={18} aria-hidden="true"/></button>}</div><div className="filter-row"><div className="chip-row">{([['all','Все вещи'],['lost','Потеряно'],['found','Найдено']] as const).map(([key,label])=><button key={key} aria-pressed={type===key} onClick={()=>setType(key)} className={'chip '+(type===key?'chip-active':'')}>{label}</button>)}</div><label className="category-select"><Filter size={17}/><select value={category} onChange={e=>setCategory(e.target.value)} aria-label="Фильтр категории"><option value="all">Все категории</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label></div></div><div className="list-heading" aria-live="polite"><h2>Объявления <span className="count-badge">{filtered.length}</span></h2><span>Сначала недавние</span></div>{filtered.length?<div className="item-grid">{[...filtered].sort((a,b)=>b.date.localeCompare(a.date)).map(x=><ItemCard key={x.id} item={x}/>)}</div>:<div className="empty-state"><Search size={34} aria-hidden="true"/><h3>Ничего не нашли</h3><p>Попробуй изменить запрос или сбросить фильтры.</p><button className="btn btn-white" onClick={()=>{setQuery('');setType('all');setCategory('all')}}>Сбросить фильтры</button></div>}</div>
}
export function NotFound(){return <div className="container empty-state"><Home size={36}/><h2>Страница не найдена</h2><Link className="btn btn-primary" to="/">На главную</Link></div>}