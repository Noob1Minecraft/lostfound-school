import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('missing Supabase configuration fails closed without collecting credentials', async ({ page }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('supabase.co')) external.push(request.url()) })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/login', '/register', '/forgot-password', '/reset-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Подключение к школе ещё не настроено' })).toBeVisible()
    await expect(page.locator('input')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  }
  for (const path of ['/app/dashboard', '/admin']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
