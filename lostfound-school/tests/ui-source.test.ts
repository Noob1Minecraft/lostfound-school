import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('application presentation sources contain no decorative emoji characters', () => {
  for (const directory of ['src', 'shared']) {
    for (const file of readdirSync(directory)) {
      if (!/\.(tsx?|css)$/.test(file)) continue
      assert.equal(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D/u.test(readFileSync(join(directory, file), 'utf8')), false, file)
    }
  }
})
