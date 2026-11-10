import { test, expect } from '@playwright/test'

// Synthetic HTTP fixtures only. These never authenticate against a live project.
const id = '11111111-1111-4111-8111-111111111111'
const user = { id, email: 'student@school.test', email_confirmed_at: '2026-11-10', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: id, exp: 4102444800, role: 'authenticated' })).toString('base64url'), 'fixture'].join('.')
const session = { access_token: token, refresh_token: 'synthetic-fixture', expires_in: 3600, token_type: 'bearer', user }
const password = 'Synthetic-fixture-42'

test.beforeEach(async ({ page }) => {
  await page.route('https://school-test.supabase.co/**', route => route.fulfill({ status: 400, json: { code: 'invalid_credentials' } }))
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/me' ? { id, display_name: 'Ученик', role: 'student' } : [] }))
})

test('registration sends only display name and shows verification instructions', async ({ page }) => {
  await page.route('**/auth/v1/signup**', async route => {
    const body = route.request().postDataJSON()
    expect(body.data).toEqual({ display_name: 'Ученик' })
    expect(body.email).toBe('student@school.test')
    await route.fulfill({ json: { ...user, email_confirmed_at: null, identities: [] } })
  })
  await page.goto('/register')
  await page.getByLabel('Имя', { exact: true }).fill('Ученик')
  await page.getByLabel('Email', { exact: true }).fill('student@school.test')
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByLabel('Повтори пароль').fill(password + 'mismatch')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Пароли не совпадают')
  await page.getByLabel('Повтори пароль').fill(password)
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('подтверди email')
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('')
})

test('login errors are actionable, session survives reload, logout removes protected access', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => route.fulfill({ status: 400, headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }, json: { code: 'email_not_confirmed', message: 'provider detail not for UI' } }))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('student@school.test')
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Подтверди email')
  await expect(page.getByRole('alert')).not.toContainText('provider detail')
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }))
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }))
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
})

test('recovery requests use the current origin and do not disclose account existence', async ({ page }) => {
  await page.route('**/auth/v1/recover**', async route => {
    expect(new URL(route.request().url()).searchParams.get('redirect_to')).toBe('http://127.0.0.1:5173/reset-password')
    expect(route.request().postDataJSON().email).toBe('student@school.test')
    await route.fulfill({ json: {} })
  })
  await page.goto('/forgot-password')
  await page.getByLabel('Email', { exact: true }).fill('student@school.test')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.getByRole('status')).toContainText('Если для этого email есть аккаунт')
})

test('recovery callback changes password through SDK and signs out', async ({ page }) => {
  let changed = false
  await page.route('**/auth/v1/user', async route => {
    if (route.request().method() === 'PUT') { expect(route.request().postDataJSON()).toMatchObject({ password }); changed = true }
    await route.fulfill({ json: user })
  })
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }))
  await page.goto(`/reset-password#access_token=${token}&refresh_token=synthetic-fixture&expires_in=3600&token_type=bearer&type=recovery`)
  await page.getByLabel('Новый пароль', { exact: true }).fill(password)
  await page.getByLabel('Повтори пароль').fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('status')).toContainText('Пароль изменён')
  expect(changed).toBe(true)
  await expect(page.getByLabel('Новый пароль', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Вернуться ко входу' }).click()
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
})

test('missing or expired recovery links cannot show a password editor', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByText('Для смены пароля открой ссылку из письма.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить пароль' })).toHaveCount(0)
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired')
  await expect(page.getByRole('alert')).toContainText('Ссылка недействительна')
})

test('backend HTML fallback fails closed and can be retried without losing the session', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }))
  await page.route('**/api/me', route => route.fulfill({ contentType: 'text/html', body: '<html>SPA fallback</html>' }))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('student@school.test')
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Школьный сервис недоступен')
  await page.goto('/app/dashboard')
  await expect(page.getByRole('alert')).toContainText('Школьный сервис недоступен')
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toHaveCount(0)
  await page.route('**/api/me', route => route.fulfill({ json: { id, display_name: 'Ученик', role: 'student' } }))
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toBeVisible()
})

test('session restoration waits for profile authorization and never flashes private content', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('student@school.test')
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toBeVisible()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/me', async route => { await pending; await route.fulfill({ status: 403, json: { error: 'Доступ к школе ещё не подтверждён.' } }) })
  await page.reload()
  await expect(page.getByRole('status')).toContainText('Загрузка')
  await expect(page.getByRole('heading', { name: 'Привет, Ученик' })).toHaveCount(0)
  release()
  await expect(page.getByRole('alert')).toContainText('Доступ к школе ещё не подтверждён')
})
