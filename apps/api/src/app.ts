import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { sessionMiddleware } from './config/session.js'
import { authRouter } from './auth/auth-routes.js'
import { rateLimit } from 'express-rate-limit'
import { doubleCsrfProtection } from './security/csrf.js'
import { AppError } from './errors/app-error.js'
import { errorHandler } from './middleware/error-handler.js'
import { originProtection } from './middleware/origin-protection.js'
import { inquiryRouter } from './inquiries/inquiry-routes.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', env.TRUST_PROXY_HOPS)
  app.use(pinoHttp({ logger }))
  app.use(helmet())
  app.use(
    cors({
      origin: new URL(env.WEB_ORIGIN).origin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  )
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '16kb' }))
  app.use(sessionMiddleware)
  app.use(cookieParser())

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_request, _response, next) => {
        next(new AppError(429, 'RATE_LIMITED', 'Too many requests'))
      },
    }),
  )
  app.use('/api', originProtection)
  app.use('/api', doubleCsrfProtection)

  app.get('/api/health', (_request, response) => {
    response.json({ data: { status: 'ok' } })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/inquiries', inquiryRouter)
  app.use('/api', (_request, _response, next) => {
    next(
      new AppError(404, 'NOT_FOUND', 'The requested API route was not found'),
    )
  })
  app.use(errorHandler)

  return app
}
