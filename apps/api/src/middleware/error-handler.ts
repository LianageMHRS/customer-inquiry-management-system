import type { ErrorRequestHandler } from 'express'
import { AppError } from '../errors/app-error.js'
import { logger } from '../config/logger.js'
import { invalidCsrfTokenError } from '../security/csrf.js'

/** Convert known failures to safe JSON responses and log unexpected errors. */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error)
    return
  }

  if (error === invalidCsrfTokenError) {
    response.status(403).json({
      error: {
        code: 'CSRF_INVALID',
        message: 'CSRF token is missing or invalid',
      },
    })
    return
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors === undefined
          ? {}
          : { fieldErrors: error.fieldErrors }),
        ...error.metadata,
      },
    })
    return
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      },
    })
    return
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    response.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      },
    })
    return
  }

  logger.error({ err: error }, 'Unhandled API error')
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  })
}
