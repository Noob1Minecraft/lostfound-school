import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import request from 'supertest'

test('emitted JavaScript API loads without TypeScript sources and fails closed', async () => {
 const root = fileURLToPath(new URL('..', import.meta.url))
 const output = await mkdtemp(join(root, 'node_modules', '.api-emit-'))
 try {
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  await writeFile(join(output, 'package.json'), '{"type":"module"}')
  for (const directory of ['api', 'server', 'shared']) {
   await mkdir(join(output, directory))
   for (const name of await readdir(join(root, directory))) {
    if (!name.endsWith('.ts')) continue
    const source = await readFile(join(root, directory, name), 'utf8')
    const emitted = ts.transpileModule(source, { compilerOptions: options, fileName: name })
    await writeFile(join(output, directory, name.replace(/\.ts$/, '.js')), emitted.outputText)
   }
  }
  // Import the actual entry point: unresolved .ts imports must fail this test.
  const entry = await import(pathToFileURL(join(output, 'api/index.js')).href)
  assert.equal(typeof entry.default, 'function')
  const { createVercelApp } = await import(pathToFileURL(join(output, 'server/vercel.js')).href)
  const res = await request(createVercelApp({})).get('/api/health')
  assert.equal(res.status, 503)
  assert.match(res.headers['content-type'], /json/)
  assert.match(res.headers['cache-control'], /no-store/)
 } finally {
  assert.ok(resolve(output).startsWith(resolve(root, 'node_modules') + sep))
  await rm(output, { recursive: true, force: true })
 }
})
