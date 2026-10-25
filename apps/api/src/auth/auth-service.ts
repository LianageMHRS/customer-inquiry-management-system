import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { hashPassword } from '../security/password.js'
import { findUserByEmail, insertStaffUser } from './auth-repository.js'
import type { PublicUser } from './auth-repository.js'

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'))

/** Verify credentials without revealing whether an email address exists. */
export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email)

  if (user === null) {
    // Keep unknown-email attempts on a password-hash verification path too.
    await argon2.verify(await dummyPasswordHash, password)
    return null
  }

  const passwordMatches = await argon2.verify(user.passwordHash, password)

  if (!passwordMatches) {
    return null
  }

  return { id: user.id, email: user.email }
}

/** Create a staff account without exposing the password or its hash. */
export async function createStaffAccount(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const passwordHash = await hashPassword(password)
  return insertStaffUser(email, passwordHash)
}
