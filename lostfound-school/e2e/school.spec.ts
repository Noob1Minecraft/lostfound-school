import { test, expect, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const owner='11111111-1111-4111-8111-111111111111'
const foundId='22222222-2222-4222-8222-222222222222'
const lostId='33333333-3333-4333-8333-333333333333'
const lost={id:lostId,owner_id:owner,type:'lost',title:'Чёрные наушники',category:'Электроника',color:'Чёрный',location:'Библиотека',date:'2026-11-10',description:'Наушники в чехле',status:'approved',image_path:null,created_at:'2026-11-10'}
const found={...lost,id:foundId,owner_id:foundId,type:'found'}
async function signedIn(page:Page,admin=false){
 const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:owner,exp:4102444800,role:'authenticated'})).toString('base64url'),'test'].join('.')
 await page.addInitScript(({token,owner})=>localStorage.setItem('sb-school-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:owner,email:'student@school.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}})),{token,owner})
 let rows=[{...lost},{...found}],claims:Record<string,unknown>[]=admin?[{id:'claim',claimant_id:owner,lost_item_id:lostId,found_item_id:foundId,evidence:'Синяя наклейка внутри чехла',status:'pending',admin_note:''}]:[]
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method()
  let data:unknown={}
  if(path==='/api/me')data={id:owner,display_name:'Алия',role:admin?'admin':'student'}
  else if(path==='/api/items'&&method==='POST'){const item={...lost,...request.postDataJSON(),id:'44444444-4444-4444-8444-444444444444',status:'pending'};rows.push(item);data=item}
  else if(path==='/api/items')data=rows
  else if(path.startsWith('/api/items/')&&method==='PATCH'){rows=rows.map(x=>x.id===path.split('/')[3]?{...x,...request.postDataJSON(),status:'pending'}:x);data=rows.find(x=>x.id===path.split('/')[3])}
  else if(path==='/api/matches')data=[{a:lost,b:found,score:100,level:'high',reasons:['Категория: +30','Цвет: +20','Место: +20','Даты в пределах 3 дней: +15','Общие слова в описании: +15']}]
  else if(path==='/api/claims'&&method==='POST'){const claim={...request.postDataJSON(),id:'claim',claimant_id:owner,status:'pending',admin_note:''};claims.push(claim);data=claim}
  else if(path==='/api/claims'||path==='/api/admin/claims')data=claims
  else if(path.startsWith('/api/admin/claims/')&&method==='PATCH'){claims=claims.map(x=>({...x,...request.postDataJSON()}));data=claims[0];if(request.postDataJSON().status==='returned')rows=rows.map(x=>({...x,status:'returned'}))}
  else if(path==='/api/admin/stats')data={lost:1,found:1,pending:0,returned:claims.filter(x=>x.status==='returned').length,claims:claims.filter(x=>x.status==='pending').length}
  await route.fulfill({json:data})
 })
}
test('public landing, mobile menu and protected redirect',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize({width:390,height:844});await page.goto('/')
 await expect(page).toHaveTitle(/Lost&Found School/);await expect(page.getByRole('heading',{name:/Найдём вместе/})).toBeVisible()
 await page.getByRole('button',{name:'Открыть меню'}).click();await page.getByRole('link',{name:'Мой кабинет'}).click()
 await expect(page).toHaveURL(/login/);await expect(page.getByLabel('Email',{exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([])
 await page.goto('/register');await expect(page.getByRole('heading',{name:'Добро пожаловать!'})).toBeVisible()
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.screenshot({path:join(tmpdir(),'lostfound-desktop.png'),fullPage:true})
})
test('student catalog search, create, edit, match explanation and claim UI',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await signedIn(page)
 await page.goto('/app');await expect(page.getByRole('heading',{name:'Чёрные наушники'})).toHaveCount(2)
 await page.getByLabel('Поиск объявлений').fill('нет такой вещи');await expect(page.getByRole('heading',{name:'Ничего не нашли'})).toBeVisible();await page.getByRole('button',{name:'Сбросить фильтры'}).click()
 await page.getByRole('link',{name:'Создать объявление',exact:true}).click();await page.getByLabel('Название вещи').fill('Зелёная тетрадь');await page.getByLabel('Описание *',{exact:true}).fill('Тетрадь в клетку с наклейкой');await page.getByRole('button',{name:'Отправить на проверку'}).click()
 await expect(page.getByRole('heading',{name:'Зелёная тетрадь'})).toBeVisible();await expect(page.getByText('На проверке',{exact:true}).first()).toBeVisible()
 await page.getByRole('link',{name:'Редактировать',exact:true}).click();await page.getByLabel('Название вещи').fill('Зелёная тетрадь по физике');await page.getByRole('button',{name:'Отправить на проверку'}).click();await expect(page.getByRole('heading',{name:'Зелёная тетрадь по физике'})).toBeVisible()
 await page.getByRole('link',{name:'Совпадения',exact:true}).click();await expect(page.getByText('100/100')).toBeVisible();await expect(page.getByText('Общие слова в описании: +15')).toBeVisible()
 await page.goto(`/app/items/${foundId}`);await page.getByLabel('Твоё объявление о потере').selectOption(lostId);await page.getByLabel('Особые приметы').fill('Внутри чехла моя синяя наклейка');await page.getByRole('button',{name:'Подать заявку'}).click()
 await page.getByRole('link',{name:'Мой кабинет'}).click();await expect(page.getByText('Внутри чехла моя синяя наклейка')).toBeVisible()
 await page.goto('/admin');await expect(page.getByRole('heading',{name:'Доступ ограничен'})).toBeVisible();expect(errors).toEqual([])
})
test('mobile authenticated catalog and creation stay inside viewport',async({page})=>{
 await signedIn(page);await page.setViewportSize({width:390,height:844});await page.goto('/app');await expect(page.getByRole('heading',{name:'Чёрные наушники'})).toHaveCount(2)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
 await page.screenshot({path:join(tmpdir(),'lostfound-mobile.png'),fullPage:true})
 await page.goto('/app/items/new');await expect(page.getByLabel('Название вещи')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
})
test('administrator reviews evidence and explicitly confirms physical return',async({page})=>{
 await signedIn(page,true);await page.goto('/admin');await expect(page.getByRole('heading',{name:'Школьное бюро находок 📊'})).toBeVisible()
 await expect(page.getByText('Синяя наклейка внутри чехла')).toBeVisible();await page.getByLabel('Комментарий проверки').fill('Приметы совпали')
 await page.getByRole('button',{name:'Подтвердить владельца'}).click();await page.getByRole('button',{name:'Оформить возврат'}).click()
 await expect(page.getByText('Подтвердите, что вещь передана владельцу лично.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Вещь передана — подтвердить'}).click()
 await expect(page.getByText('Возвращено',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Оформить возврат'})).toHaveCount(0)
})
