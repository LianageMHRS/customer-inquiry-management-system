import { z } from 'zod'
import { env } from '../src/config/env.js'
import { pool } from '../src/db/pool.js'
import { hashPassword } from '../src/security/password.js'

const seedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
})

const seedConfigSchema = z
  .object({
    firstUser: seedUserSchema,
    secondUser: seedUserSchema,
  })
  .refine(
    // Avoid ambiguous credentials when two seeded accounts are configured.
    ({ firstUser, secondUser }) => firstUser.email !== secondUser.email,
    'Seed account emails must be different',
  )

/** Create configured local staff accounts without overwriting existing users. */
async function seedStaffAccounts(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('The development seed must not run in production')
  }

  const config = seedConfigSchema.safeParse({
    firstUser: {
      email: env.SEED_USER_ONE_EMAIL,
      password: env.SEED_USER_ONE_PASSWORD,
    },
    secondUser: {
      email: env.SEED_USER_TWO_EMAIL,
      password: env.SEED_USER_TWO_PASSWORD,
    },
  })

  if (!config.success) {
    const invalidFields = config.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ')
    throw new Error(`Invalid seed configuration fields: ${invalidFields}`)
  }

  const firstHash = await hashPassword(config.data.firstUser.password)
  const secondHash = await hashPassword(config.data.secondUser.password)

  await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [
      config.data.firstUser.email,
      firstHash,
      config.data.secondUser.email,
      secondHash,
    ],
  )
}

try {
  await seedStaffAccounts()
  process.stdout.write('Development staff accounts seeded successfully.\n')
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(
    `Unable to seed development staff accounts: ${message}\n`,
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
