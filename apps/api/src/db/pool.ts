import { Pool, type PoolClient } from 'pg'
import { env } from '../config/env.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
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
