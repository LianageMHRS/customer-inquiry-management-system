import argon2, { type HashOptions } from 'argon2'

const ARGON2ID_OPTIONS: HashOptions = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2ID_OPTIONS)
}
