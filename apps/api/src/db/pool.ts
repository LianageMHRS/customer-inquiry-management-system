import { Pool, type PoolClient } from 'pg'
import { env } from '../config/env.js'

const connectionString =
  env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL

if (connectionString === undefined) {
  throw new Error('A database URL is required for this environment')
}

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
})

export async function withTransaction<Result>(
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Database transaction failed and rollback also failed',
        { cause: rollbackError },
      )
    }
    throw error
  } finally {
    client.release()
  }
}
