import { test, expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { signedIn } from './fixtures'
const foundId='22222222-2222-4222-8222-222222222222'
const lostId='33333333-3333-4333-8333-333333333333'
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
 await signedIn(page,true);await page.goto('/admin');await expect(page.getByRole('heading',{name:'Школьное бюро находок'})).toBeVisible()
 await expect(page.getByText('Синяя наклейка внутри чехла')).toBeVisible();await page.getByLabel('Комментарий проверки').fill('Приметы совпали')
 await page.getByRole('button',{name:'Подтвердить владельца'}).click();await page.getByRole('button',{name:'Оформить возврат'}).click()
 await expect(page.getByText('Подтвердите, что вещь передана владельцу лично.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Вещь передана — подтвердить'}).click()
 await expect(page.getByText('Возвращено',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Оформить возврат'})).toHaveCount(0)
})
