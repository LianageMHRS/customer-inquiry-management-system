import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { INQUIRY_FIELD_LIMITS } from '@customer-inquiry/shared/inquiry'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import { toFieldErrors } from '../errors/field-errors.js'
import { generateCsrfToken } from '../security/csrf.js'
import { authenticate } from './auth-service.js'
import { findPublicUserById } from './auth-repository.js'
import { requireAuth } from './auth-middleware.js'

const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(INQUIRY_FIELD_LIMITS.contact)
      .pipe(z.email())
      .transform((email) => email.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  // Keep rate-limit failures in the shared API error format.
  handler: (_request, _response, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts'))
  },
})

/** Wrap session regeneration so route handlers can await and catch failures. */
function regenerateSession(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

/** Persist session changes before sending a response that depends on them. */
function saveSession(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

/** Wrap session destruction so callers can handle store errors consistently. */
function destroySession(request: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

const router = Router()

/** Initialize a session and return the CSRF token required for mutations. */
router.get('/csrf', async (request, response, next) => {
  try {
    request.session.csrfInitialized = true
    await saveSession(request)
    response.json({
      data: {
        csrfToken: generateCsrfToken(request, response, { overwrite: true }),
      },
    })
  } catch (error) {
    next(error)
  }
})

/** Validate credentials, rotate the session, and return public user details. */
router.post('/login', loginLimiter, async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body)

  if (!parsed.success) {
    next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'Email and password are required',
        toFieldErrors(parsed.error.issues),
      ),
    )
    return
  }

  try {
    const user = await authenticate(parsed.data.email, parsed.data.password)

    if (user === null) {
      next(
        new AppError(
          401,
          'INVALID_CREDENTIALS',
          'Email or password is incorrect',
        ),
      )
      return
    }

    // Replace the pre-authentication session ID to prevent session fixation.
    await regenerateSession(request)
    request.session.userId = user.id
    request.session.createdAt = Date.now()
    request.session.lastSeenAt = Date.now()
    await saveSession(request)

    response.json({
      data: {
        user,
        csrfToken: generateCsrfToken(request, response, { overwrite: true }),
      },
    })
  } catch (error) {
    next(error)
  }
})

/** Resolve the current session to a public user or expire a stale account. */
router.get('/me', requireAuth, async (request, response, next) => {
  try {
    const userId = request.session.userId

    if (userId === undefined) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Sign in is required'))
      return
    }

    const user = await findPublicUserById(userId)

    if (user === null) {
      await destroySession(request)
      response.clearCookie('cim.sid', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      })
      next(new AppError(401, 'UNAUTHENTICATED', 'Your session has expired'))
      return
    }

    response.json({ data: { user } })
  } catch (error) {
    next(error)
  }
})

/** End the authenticated session and issue a fresh anonymous CSRF token. */
router.post('/logout', requireAuth, async (request, response, next) => {
  try {
    // Rotate to a fresh anonymous session so the authenticated ID is discarded.
    await regenerateSession(request)
    request.session.csrfInitialized = true
    await saveSession(request)
    response.json({
      data: {
        loggedOut: true,
        csrfToken: generateCsrfToken(request, response, { overwrite: true }),
      },
    })
  } catch (error) {
    next(error)
  }
})

export { router as authRouter }
