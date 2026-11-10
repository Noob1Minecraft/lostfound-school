import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signedIn } from './fixtures'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('public pages pass automated accessibility checks and mobile keyboard navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://school-test.supabase.co/**', route => route.abort())
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Найдём вместе/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: join(tmpdir(), 'lostfound-redesign-desktop.png'), fullPage: true })
  for (const route of ['/', '/login', '/register', '/forgot-password', '/reset-password']) {
    await page.goto(route)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await expect(page.getByRole('link', { name: 'Каталог', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused()
  await page.screenshot({ path: join(tmpdir(), 'lostfound-redesign-mobile.png'), fullPage: true })
  await page.goto('/login')
  await page.screenshot({ path: join(tmpdir(), 'lostfound-redesign-auth.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('student screens have accessible controls, SVG fallbacks and responsive layouts', async ({ page }) => {
  await signedIn(page)
  for (const path of ['/app', '/app/dashboard', '/app/items/new', '/app/items/22222222-2222-4222-8222-222222222222', '/app/matches']) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Загрузка…', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  }
  await page.goto('/app')
  await expect(page.locator('.category-art svg')).toHaveCount(2)
  await page.getByRole('button', { name: 'Найдено', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Найдено', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.item-card')).toHaveCount(1)
  await page.getByLabel('Фильтр категории').selectOption('Одежда')
  await expect(page.getByRole('heading', { name: 'Ничего не нашли' })).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect(page.locator('.item-card')).toHaveCount(2)
})

test('admin screens pass accessibility checks at mobile width', async ({ page }) => {
  await signedIn(page, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin')
  await expect(page.getByText('Синяя наклейка внутри чехла')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})
