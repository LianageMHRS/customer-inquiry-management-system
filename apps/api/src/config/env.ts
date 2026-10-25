import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),
    TEST_DATABASE_URL: z.url().optional(),
    TEST_MIGRATION_DATABASE_URL: z.url().optional(),
    SEED_USER_ONE_EMAIL: z.email().optional(),
    SEED_USER_ONE_PASSWORD: z.string().optional(),
    SEED_USER_TWO_EMAIL: z.email().optional(),
    SEED_USER_TWO_PASSWORD: z.string().optional(),
    SESSION_SECRET: z.string().min(64),
  })
  // Keep test data confined to an explicitly local, separately named database.
  .superRefine((configuration, context) => {
    if (configuration.NODE_ENV !== 'test') {
      return
    }

    if (configuration.TEST_DATABASE_URL === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'TEST_DATABASE_URL is required when NODE_ENV is test',
      })
      return
    }

    const testDatabaseUrl = new URL(configuration.TEST_DATABASE_URL)

    if (!testDatabaseUrl.pathname.endsWith('_test')) {
      context.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'The test database name must end in _test',
      })
    }

    if (
      !['localhost', '127.0.0.1', '::1', '[::1]'].includes(
        testDatabaseUrl.hostname,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'The test database must be hosted on this machine',
      })
    }
  })

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  process.stderr.write(
    `Invalid environment configuration: ${result.error.message}\n`,
  )
  process.exit(1)
}

export const env = result.data
