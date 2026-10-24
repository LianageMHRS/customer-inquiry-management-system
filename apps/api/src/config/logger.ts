import pino from 'pino'

export const logger = pino({
  level:
    process.env.NODE_ENV === 'test'
      ? 'silent'
      : process.env.NODE_ENV === 'production'
        ? 'info'
        : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-csrf-token',
      'res.headers.set-cookie',
    ],
    censor: '[REDACTED]',
  },
})
