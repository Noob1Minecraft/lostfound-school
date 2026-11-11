import { test, expect, type Page } from '@playwright/test'
async function fixture(page:Page, role='student', loggedIn=false){
 let signedIn=loggedIn, closed=false
 const calls:{path:string;body:unknown}[]=[]
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname
  expect(request.headers().authorization).toBeUndefined()
  const body=request.postData()?request.postDataJSON():null
  calls.push({path,body})
  let data:unknown={ok:true}
  if(path.endsWith('/get-session'))data=signedIn?{user:{id:'managed-id',email:'pupil@school.test',name:'Ученик'}}:null
  else if(path.endsWith('/sign-in/email'))signedIn=true
  else if(path.endsWith('/sign-out'))signedIn=false
  else if(path==='/api/items/item-id/close')closed=true
  else if(path==='/api/me')data={id:'student-id',display_name:'Ученик',role}
  else if(path==='/api/admin/stats')data={}
  else if(path==='/api/admin/members')data=request.method()==='GET'?[{email:'pupil@school.test',role:'student',active:true}]:{ok:true}
  else if(path==='/api/items')data=[{id:'item-id',owner_id:'student-id',type:'lost',title:'Синяя тетрадь',category:'Школьные принадлежности',color:'Синий',location:'Библиотека',date:'2026-11-01',description:'Тетрадь с рисунком',status:closed?'closed':'approved',image_path:null,created_at:'2026-11-01T00:00:00Z'}]
  else if(path.endsWith('/claims')||path.endsWith('/matches'))data=[]
  await route.fulfill({json:data})
 })
 return calls
}
test('cookie session login, protected catalog and logout',async({page})=>{
 const calls=await fixture(page)
 await page.goto('/app')
 await expect(page).toHaveURL(/\/login$/)
 await page.getByLabel('Email',{exact:true}).fill('pupil@school.test')
 await page.getByLabel('Пароль',{exact:true}).fill('test-password-long')
 await page.getByRole('button',{name:'Войти',exact:true}).click()
 await expect(page).toHaveURL('http://127.0.0.1:5175/app')
 await page.goto('/app/my-items')
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Выйти',exact:true}).click()
 await expect(page).toHaveURL(/\/login$/)
 expect(calls.some(x=>x.path==='/api/items')).toBeTruthy()
})
test('registration and forgot password use managed endpoints',async({page})=>{
 const calls=await fixture(page)
 await page.goto('/register')
 await page.getByLabel('Имя',{exact:true}).fill('Ученик')
 await page.getByLabel('Email',{exact:true}).fill('pupil@school.test')
 await page.getByLabel('Пароль',{exact:true}).fill('test-password-long')
 await page.getByLabel('Повтори пароль').fill('test-password-long')
 await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('Проверь почту')
 await page.goto('/forgot-password')
 await page.getByLabel('Email',{exact:true}).fill('pupil@school.test')
 await page.getByRole('button',{name:'Отправить ссылку'}).click()
 await expect(page.getByRole('status')).toContainText('Если для этого email')
 expect(calls.find(x=>x.path.endsWith('/sign-up/email'))?.body).toMatchObject({name:'Ученик',callbackURL:'http://127.0.0.1:5175/login'})
})
test('reset token removed from address and sent only in reset body',async({page})=>{
 const calls=await fixture(page)
 await page.goto('/reset-password?token=synthetic-email-token')
 await expect(page).toHaveURL('http://127.0.0.1:5175/reset-password')
 await page.getByLabel('Новый пароль',{exact:true}).fill('replacement-password')
 await page.getByLabel('Повтори пароль').fill('replacement-password')
 await page.getByRole('button',{name:'Сохранить пароль'}).click()
 await expect(page.getByRole('status')).toContainText('Пароль изменён')
 expect(calls.find(x=>x.path.endsWith('/reset-password'))?.body).toEqual({token:'synthetic-email-token',newPassword:'replacement-password'})
})
test('owner can close a listing',async({page})=>{
 const calls=await fixture(page,'student',true)
 await page.goto('/app/items/item-id')
 await page.getByRole('button',{name:'Закрыть объявление'}).click()
 await expect(page.getByText('Закрыто',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Закрыть объявление'})).toHaveCount(0)
 expect(calls.some(x=>x.path==='/api/items/item-id/close')).toBeTruthy()
})
test('administrator can manage membership',async({page})=>{
 const calls=await fixture(page,'admin',true)
 await page.goto('/admin')
 await expect(page.getByLabel('Email участника')).toHaveCount(0)
 await page.locator('summary').filter({hasText:'Школьный доступ'}).click()
 await page.getByLabel('Email участника').fill('new@school.test')
 await page.getByLabel('Роль',{exact:true}).selectOption('student')
 await page.getByRole('button',{name:'Сохранить доступ'}).click()
 await expect(page.getByRole('status')).toContainText('Школьный доступ сохранён')
 expect(calls.some(x=>x.path==='/api/admin/members'&&JSON.stringify(x.body).includes('new@school.test'))).toBeTruthy()
})
test('unavailable managed service exposes recoverable error',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Сервис временно недоступен'}}))
 await page.goto('/login')
 await expect(page.getByRole('alert')).toContainText('Не удалось восстановить вход')
})

test('unverified email can request another confirmation email',async({page})=>{
 const calls=await fixture(page)
 await page.route('**/api/auth/sign-in/email',route=>route.fulfill({status:403,json:{error:'Подтвердите email',code:'EMAIL_NOT_VERIFIED'}}))
 await page.goto('/login')
 await page.getByLabel('Email',{exact:true}).fill('pupil@school.test')
 await page.getByLabel('Пароль',{exact:true}).fill('test-password-long')
 await page.getByRole('button',{name:'Войти',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Подтверди email')
 await page.getByRole('button',{name:'Отправить письмо подтверждения снова'}).click()
 await expect(page.getByRole('status')).toContainText('ожидает подтверждения')
 expect(calls.some(x=>x.path.endsWith('/send-verification-email'))).toBeTruthy()
})

test('page refresh restores cookie session and clears expired access',async({page})=>{
 await fixture(page,'student',true)
 await page.goto('/app/my-items')
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.route('**/api/auth/get-session',route=>route.fulfill({json:null}))
 await page.reload()
 await expect(page).toHaveURL(/\/login$/)
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toHaveCount(0)
})

test('focus revalidation clears an expired cookie session',async({page})=>{
 await fixture(page,'student',true)
 await page.goto('/app/my-items')
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.route('**/api/auth/get-session',route=>route.fulfill({json:null}))
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page).toHaveURL(/\/login$/)
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toHaveCount(0)
})
test('business API 401 clears protected UI immediately',async({page})=>{
 await fixture(page,'student',true)
 await page.goto('/app/my-items')
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.route('**/api/matches',route=>route.fulfill({status:401,json:{error:'Session expired'}}))
 await page.getByRole('link',{name:'Совпадения',exact:true}).click()
 await expect(page).toHaveURL(/\/login$/)
 await expect(page.getByRole('button',{name:'Выйти',exact:true})).toHaveCount(0)
})
test('logout notifies another tab and removes its protected view',async({page,context})=>{
 await fixture(page,'student',true)
 const other=await context.newPage()
 await fixture(other,'student',true)
 await other.goto('/app/my-items')
 await expect(other.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await page.goto('/app/my-items')
 await expect(page.getByText('Синяя тетрадь',{exact:true})).toBeVisible()
 await other.route('**/api/auth/get-session',route=>route.fulfill({json:null}))
 await page.getByRole('button',{name:'Выйти',exact:true}).click()
 await expect(other).toHaveURL(/\/login$/)
 await expect(other.getByText('Синяя тетрадь',{exact:true})).toHaveCount(0)
 await other.close()
})

test('valid focus revalidation preserves an unsaved listing draft and file',async({page})=>{
 const calls=await fixture(page,'student',true)
 await page.goto('/app/items/new')
 await page.getByLabel('Название вещи').fill('Несохранённая тетрадь')
 await page.getByLabel('Описание *',{exact:true}).fill('Черновик описания с приметами')
 await page.getByLabel('Фото вещи').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:Buffer.from('synthetic-file')})
 const before=calls.filter(x=>x.path.endsWith('/get-session')).length
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect.poll(()=>calls.filter(x=>x.path.endsWith('/get-session')).length).toBeGreaterThan(before)
 await expect(page.getByLabel('Название вещи')).toHaveValue('Несохранённая тетрадь')
 await expect(page.getByLabel('Описание *',{exact:true})).toHaveValue('Черновик описания с приметами')
 expect(await page.getByLabel('Фото вещи').evaluate(input=>(input as HTMLInputElement).files?.[0]?.name)).toBe('draft.png')
})
