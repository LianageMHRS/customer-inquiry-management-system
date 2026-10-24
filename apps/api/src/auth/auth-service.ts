import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { hashPassword } from '../security/password.js'
import { findUserByEmail } from './auth-repository.js'
import type { PublicUser } from './auth-repository.js'

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'))

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email)

  if (user === null) {
    await argon2.verify(await dummyPasswordHash, password)
    return null
  }

  const passwordMatches = await argon2.verify(user.passwordHash, password)

  if (!passwordMatches) {
    return null
  }

  return { id: user.id, email: user.email }
}
