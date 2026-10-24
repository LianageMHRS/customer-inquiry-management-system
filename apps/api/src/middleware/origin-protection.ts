import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const allowedOrigin = new URL(env.WEB_ORIGIN).origin

export const originProtection: RequestHandler = (request, _response, next) => {
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
