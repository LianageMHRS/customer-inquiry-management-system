import argon2 from 'argon2'
import { describe, expect, it } from 'vitest'
import { hashPassword } from '../src/security/password.js'

describe('hashPassword', () => {
  it('creates an Argon2id hash that verifies only the original password', async () => {
    const password = 'development-password-for-test'
    const passwordHash = await hashPassword(password)

    expect(passwordHash).toMatch(/^\$argon2id\$/)
    expect(passwordHash).not.toContain(password)
    expect(await argon2.verify(passwordHash, password)).toBe(true)
    expect(await argon2.verify(passwordHash, 'a-different-password')).toBe(
      false,
    )
  })
})
