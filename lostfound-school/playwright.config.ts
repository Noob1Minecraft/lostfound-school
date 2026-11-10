import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export default defineConfig({
 testDir: './e2e', fullyParallel: false, workers: 1, reporter: 'list',
 outputDir: join(tmpdir(), 'lostfound-playwright'),
 use: { channel: 'chrome', screenshot: 'only-on-failure' },
 projects: [
  { name: 'configured-fixtures', testIgnore: '**/unconfigured.spec.ts', use: { baseURL: 'http://127.0.0.1:5173' } },
  { name: 'unconfigured', testMatch: '**/unconfigured.spec.ts', use: { baseURL: 'http://127.0.0.1:5174' } },
 ],
 webServer: [
  { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false, env: { VITE_SUPABASE_URL: 'https://school-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testfixture', VITE_API_URL: '/api' } },
  { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false, env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_URL: '/api' } },
 ],
})
