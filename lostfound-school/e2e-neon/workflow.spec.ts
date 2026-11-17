import { test, expect } from '@playwright/test'
import type { Item, Claim } from '../shared/domain'

test('two student accounts and staff complete a return using cookie auth',async({page})=>{
 let email='',sequence=0
 const items:Item[]=[],claims:Claim[]=[]
 const identity=()=>email.startsWith('staff')?'admin':email.startsWith('finder')?'finder':'owner'
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method(),body=req.postData()?req.postDataJSON():{}
  expect(req.headers().authorization).toBeUndefined()
  let data:unknown={ok:true}
  if(path.endsWith('/get-session'))data=email?{user:{id:identity(),email}}:null
  else if(path.endsWith('/sign-in/email'))email=body.email
  else if(path.endsWith('/sign-out'))email=''
  else if(path==='/api/me')data={id:identity(),display_name:identity(),role:identity()==='admin'?'admin':'student'}
  else if(path==='/api/items'&&method==='POST'){const item:Item={...body,id:`item-${++sequence}`,owner_id:identity(),status:'pending',image_path:null,created_at:'2026-11-01T00:00:00Z'};items.push(item);data=item}
  else if(path==='/api/items')data=items.filter(x=>identity()==='admin'||x.owner_id===identity()||x.status==='approved')
  else if(path.startsWith('/api/admin/items/')){const item=items.find(x=>x.id===path.split('/').at(-1))!;item.status=body.status;data=item}
  else if(path==='/api/claims'&&method==='POST'){const claim:Claim={...body,id:'claim-1',claimant_id:identity(),status:'pending',admin_note:'',created_at:'2026-11-01T00:00:00Z'};claims.push(claim);data=claim}
  else if(path.startsWith('/api/admin/claims/')){const claim=claims[0];claim.status=body.status;claim.admin_note=body.admin_note;if(body.status==='returned')for(const item of items)item.status='returned';data=claim}
  else if(path==='/api/claims'||path==='/api/admin/claims')data=claims.filter(x=>identity()==='admin'||x.claimant_id===identity())
  else if(path==='/api/admin/stats')data={}
  else data=[]
  await route.fulfill({json:data})
 })
 async function login(address:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(address);await page.getByLabel('Пароль',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page).toHaveURL(/\/app(?:\/|$)/);await page.goto('/app/dashboard')}
 async function logout(){await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page).toHaveURL(/\/login$/)}
 async function create(type:'lost'|'found',title:string){await page.goto(`/app/items/new?type=${type}`);await page.getByLabel('Название вещи').fill(title);await page.getByLabel('Описание *',{exact:true}).fill('Чёрные наушники в синем чехле');await page.getByRole('button',{name:'Отправить на проверку'}).click();await expect(page.getByRole('heading',{name:title})).toBeVisible()}
 await login('owner@school.test');await create('lost','Потерянные наушники');await logout()
 await login('finder@school.test');await create('found','Найденные наушники');await logout()
 await login('staff@school.test');await page.goto('/admin');await page.getByRole('button',{name:'Одобрить',exact:true}).first().click();await expect(page.getByRole('button',{name:'Одобрить',exact:true})).toHaveCount(1);await page.getByRole('button',{name:'Одобрить',exact:true}).click();await expect(page.getByRole('button',{name:'Одобрить',exact:true})).toHaveCount(0);await logout()
 await login('owner@school.test');await page.goto('/app/items/item-2');await page.getByLabel('Твоё объявление о потере').selectOption('item-1');await page.getByLabel('Особые приметы').fill('Синяя наклейка внутри чехла');await page.getByRole('button',{name:'Подать заявку'}).click();await expect.poll(()=>claims.length).toBe(1);await page.goto('/app/dashboard');await expect(page.getByText('Синяя наклейка внутри чехла')).toBeVisible();await logout()
 await login('finder@school.test');await expect(page.getByText('Синяя наклейка внутри чехла')).toHaveCount(0);await logout()
 await login('staff@school.test');await page.goto('/admin');await page.getByLabel('Комментарий проверки').fill('Приметы проверены');await page.getByRole('button',{name:'Подтвердить владельца'}).click();await page.getByRole('button',{name:'Оформить возврат'}).click();await page.getByRole('button',{name:'Вещь передана — подтвердить'}).click();await expect(page.getByText('Возвращено',{exact:true})).toBeVisible();expect(items.every(item=>item.status==='returned')).toBeTruthy()
})
