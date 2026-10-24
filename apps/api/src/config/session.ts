import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { env } from './env.js'
import { logger } from './logger.js'
import { pool } from '../db/pool.js'

const PgSessionStore = connectPgSimple(session)

export const sessionMiddleware = session({
  name: 'cim.sid',
  secret: env.SESSION_SECRET,
  store: new PgSessionStore({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
    pruneSessionInterval: env.NODE_ENV === 'test' ? false : 900,
    errorLog: (error) => logger.error({ err: error }, 'Session store error'),
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60 * 1000,
  },
})
