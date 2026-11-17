import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Exercise the real Vite config with the documented platform environment on Linux CI.
const metadata = JSON.parse(readFileSync(new URL('../tests/fixtures/vercel-preview.json', import.meta.url), 'utf8'))
const serverOnlyCanary = 'server-only-build-fixture-not-a-real-credential'
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, ...metadata, S3_SECRET_ACCESS_KEY: serverOnlyCanary },
})
if (result.error) throw result.error
if (result.status === 0) {
  for (const file of readdirSync('dist', { recursive: true, withFileTypes: true })) {
    if (file.isFile() && readFileSync(join(file.parentPath, file.name)).includes(serverOnlyCanary)) {
      throw new Error('Server-only credential fixture leaked into frontend output')
    }
  }
}
process.exit(result.status ?? 1)
