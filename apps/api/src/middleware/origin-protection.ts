import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const allowedOrigin = new URL(env.WEB_ORIGIN).origin

/** Reject browser mutations whose Origin differs from the configured web app. */
export const originProtection: RequestHandler = (request, _response, next) => {
  // Reads do not mutate state; writes must come from our configured web app.
  if (safeMethods.has(request.method)) {
    next()
    return
  }

  if (request.get('origin') !== allowedOrigin) {
    next(
      new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed'),
    )
    return
  }

  next()
}
