import { env } from './config/env.js'
import { createApp } from './app.js'
import { logger } from './config/logger.js'
import { pool } from './db/pool.js'

const app = createApp()
const server = app.listen(env.PORT, () => {
  process.stdout.write(`API listening on http://localhost:${env.PORT}\n`)
})

let isShuttingDown = false

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  logger.info({ signal }, 'Shutting down API server')

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out; closing active connections')
    server.closeAllConnections()
  }, 10_000)
  timeout.unref()

  server.close((error) => {
    clearTimeout(timeout)

    if (error) {
      logger.error({ err: error }, 'Failed to close API server')
      process.exitCode = 1
    }

    void pool
      .end()
      .then(() => {
        logger.info('Database pool closed')
      })
      .catch((poolError: unknown) => {
        logger.error({ err: poolError }, 'Failed to close database pool')
        process.exitCode = 1
      })
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.once('error', (error: Error) => {
  logger.fatal({ err: error }, 'API server failed to start')
  process.exitCode = 1
})
