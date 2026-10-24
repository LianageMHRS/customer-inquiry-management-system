import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'

const idleTimeoutMs = 30 * 60 * 1000
const absoluteTimeoutMs = 8 * 60 * 60 * 1000

export const requireAuth: RequestHandler = (request, response, next) => {
  const { userId, createdAt, lastSeenAt } = request.session
  const now = Date.now()

  if (userId === undefined) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Sign in is required'))
    return
  }

  if (
    createdAt === undefined ||
    lastSeenAt === undefined ||
    now - lastSeenAt >= idleTimeoutMs ||
    now - createdAt >= absoluteTimeoutMs
  ) {
    request.session.destroy((error) => {
      if (error) {
        next(error)
        return
      }
      response.clearCookie('cim.sid', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      })
      next(new AppError(401, 'UNAUTHENTICATED', 'Your session has expired'))
    })
    return
  }

  request.session.lastSeenAt = now
  next()
}
