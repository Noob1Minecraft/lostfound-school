import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authError } from '../shared/auth-errors.ts'

test('auth errors explain confirmation, throttling and recovery without raw provider details', () => {
  assert.match(authError({ code: 'email_not_confirmed' }), /Подтверди email/)
  assert.match(authError({ code: 'over_request_rate_limit' }), /Слишком много/)
  assert.match(authError({ code: 'otp_expired' }), /устарела/)
  assert.match(authError({ code: 'weak_password' }), /12 символов/)
  assert.match(authError({ code: 'same_password' }), /отличаться/)
  assert.match(authError({ code: 'invalid_credentials' }), /Проверь email и пароль/)
  assert.equal(authError({ message: 'sensitive provider detail', code: 'unknown' }), authError(null))
  assert.ok(!authError(new Error('sensitive provider detail')).includes('sensitive'))
})
