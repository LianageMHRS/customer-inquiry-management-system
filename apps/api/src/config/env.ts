import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url(),
  MIGRATION_DATABASE_URL: z.url().optional(),
  TEST_DATABASE_URL: z.url().optional(),
  TEST_MIGRATION_DATABASE_URL: z.url().optional(),
  SEED_USER_ONE_EMAIL: z.email().optional(),
  SEED_USER_ONE_PASSWORD: z.string().optional(),
  SEED_USER_TWO_EMAIL: z.email().optional(),
  SEED_USER_TWO_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(64).optional(),
})

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  process.stderr.write(
    `Invalid environment configuration: ${result.error.message}\n`,
  )
  process.exit(1)
}

export const env = result.data
