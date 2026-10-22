import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url().optional(),
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
