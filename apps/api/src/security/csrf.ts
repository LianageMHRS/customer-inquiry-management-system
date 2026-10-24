import { createHmac } from 'node:crypto'
import { doubleCsrf } from 'csrf-csrf'
import { env } from '../config/env.js'

const csrfSecret = createHmac('sha256', env.SESSION_SECRET)
  .update('customer-inquiry-csrf-token')
  .digest('hex')

export const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (request) => request.session.id,
  cookieName: 'cim.csrf',
  cookieOptions: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  },
  getCsrfTokenFromRequest: (request) => request.get('X-CSRF-Token'),
  errorConfig: {
    statusCode: 403,
    message: 'CSRF token is missing or invalid',
    code: 'CSRF_INVALID',
  },
})
