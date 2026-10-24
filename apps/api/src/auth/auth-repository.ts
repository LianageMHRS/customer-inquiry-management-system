import { pool } from '../db/pool.js'

export interface AuthUser {
  id: string
  email: string
  passwordHash: string
}

export interface PublicUser {
  id: string
  email: string
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const result = await pool.query<AuthUser>(
    `SELECT id, email, password_hash AS "passwordHash"
     FROM users
     WHERE email = $1`,
    [email],
  )

  return result.rows[0] ?? null
}

export async function findPublicUserById(
  id: string,
): Promise<PublicUser | null> {
  const result = await pool.query<PublicUser>(
    'SELECT id, email FROM users WHERE id = $1',
    [id],
  )

  return result.rows[0] ?? null
}
