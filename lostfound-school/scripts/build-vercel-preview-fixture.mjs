import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Exercise the real Vite config with the documented platform environment on Linux CI.
const metadata = JSON.parse(readFileSync(new URL('../tests/fixtures/vercel-preview.json', import.meta.url), 'utf8'))
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, ...metadata },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
