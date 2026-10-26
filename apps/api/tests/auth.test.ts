import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INQUIRY_FIELD_LIMITS } from '@customer-inquiry/shared/inquiry'
import { env } from '../src/config/env.js'
import { pool } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { hashPassword } from '../src/security/password.js'
import { authenticate, createStaffAccount } from '../src/auth/auth-service.js'

const webOrigin = new URL(env.WEB_ORIGIN).origin
const testEmail = `auth-${randomUUID()}@example.test`
const secondTestEmail = `auth-${randomUUID()}@example.test`
const provisionedEmail = `provisioned-${randomUUID()}@example.test`
const testPassword = 'a-test-only-password-value'
const sessionIds = new Set<string>()
const cleanupConnectionString = env.TEST_MIGRATION_DATABASE_URL

if (env.NODE_ENV !== 'test' || cleanupConnectionString === undefined) {
  throw new Error('Authentication integration tests require test database URLs')
}

const cleanupDatabaseUrl = new URL(cleanupConnectionString)

if (
  !cleanupDatabaseUrl.pathname.endsWith('_test') ||
  !['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    cleanupDatabaseUrl.hostname,
  )
) {
  throw new Error(
    'Authentication test cleanup must use a local database ending in _test',
  )
}

const cleanupPool = new Pool({ connectionString: cleanupConnectionString })

/** Normalize Supertest's set-cookie header for assertions in auth tests. */
function getSetCookies(response: Response): string[] {
  const cookies = response.headers['set-cookie']
  if (cookies === undefined) {
    return []
  }

  return Array.isArray(cookies) ? cookies : [cookies]
}

/** Extract and record a test session ID so teardown can remove it. */
function getSessionId(response: Response): string {
  const sessionCookie = getSetCookies(response).find((cookie) =>
    cookie.startsWith('cim.sid='),
  )

  if (sessionCookie === undefined) {
    throw new Error('Expected the API to set a session cookie')
  }

  const encodedValue = sessionCookie.slice('cim.sid='.length).split(';')[0]

  if (encodedValue === undefined) {
    throw new Error('Expected the session cookie to contain a value')
  }

  const signedValue = decodeURIComponent(encodedValue)
  const sessionId = signedValue.slice(2, signedValue.lastIndexOf('.'))
  sessionIds.add(sessionId)
  return sessionId
}

describe('authentication API', () => {
  // Create isolated staff accounts shared by this suite's integration cases.
  beforeAll(async () => {
    const passwordHash = await hashPassword(testPassword)
    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2), ($3, $2)',
      [testEmail, passwordHash, secondTestEmail],
    )
  })

  // Remove test records and sessions so repeated runs remain independent.
  afterAll(async () => {
    if (sessionIds.size > 0) {
      await cleanupPool.query(
        'DELETE FROM "session" WHERE sid = ANY($1::varchar[])',
        [Array.from(sessionIds)],
      )
    }

    await cleanupPool.query(
      'DELETE FROM inquiries WHERE created_by_id = (SELECT id FROM users WHERE email = $1)',
      [testEmail],
    )
    await cleanupPool.query(
      'DELETE FROM inquiries WHERE created_by_id = (SELECT id FROM users WHERE email = $1)',
      [secondTestEmail],
    )
    await cleanupPool.query(
      'DELETE FROM users WHERE email = ANY($1::varchar[])',
      [[testEmail, secondTestEmail, provisionedEmail]],
    )
    await cleanupPool.end()
  })

  // Verify CLI account provisioning hashes passwords and never overwrites users.
  it('creates a staff account and leaves an existing account unchanged', async () => {
    const created = await createStaffAccount(provisionedEmail, testPassword)
    expect(created).toMatchObject({
      id: expect.any(String),
      email: provisionedEmail,
    })

    const duplicate = await createStaffAccount(
      provisionedEmail,
      'a-different-password-value',
    )
    expect(duplicate).toBeNull()

    expect(await authenticate(provisionedEmail, testPassword)).toMatchObject({
      email: provisionedEmail,
    })
    expect(
      await authenticate(provisionedEmail, 'a-different-password-value'),
    ).toBeNull()

    const account = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [provisionedEmail],
    )
    expect(account.rows[0]?.password_hash).not.toBe(testPassword)
    expect(account.rows[0]?.password_hash).toMatch(/^\$argon2id\$/)
  })

  // Keep database constraints synchronized with shared form/API limits.
  it('keeps database inquiry field limits aligned with shared application limits', async () => {
    const result = await pool.query<{
      column_name: string
      character_maximum_length: number | null
    }>(
      `SELECT column_name, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'inquiries'
         AND column_name = ANY($1::text[])`,
      [['customer_name', 'contact', 'subject', 'description']],
    )
    const limits = Object.fromEntries(
      result.rows.map(({ column_name, character_maximum_length }) => [
        column_name,
        character_maximum_length,
      ]),
    )

    expect(limits).toEqual({
      customer_name: INQUIRY_FIELD_LIMITS.customerName,
      contact: INQUIRY_FIELD_LIMITS.contact,
      subject: INQUIRY_FIELD_LIMITS.subject,
      description: INQUIRY_FIELD_LIMITS.description,
    })
  })

  // Cover CSRF enforcement, shared-inbox access, validation, and lifecycle.
  it('requires a CSRF token and rotates the session after successful login', async () => {
    const app = createApp()
    const client = request.agent(app)
    const csrfResponse = await client.get('/api/auth/csrf')

    expect(csrfResponse.status).toBe(200)
    expect(csrfResponse.headers['cache-control']).toBe('no-store')
    expect(typeof csrfResponse.body.data.csrfToken).toBe('string')
    const cookies = getSetCookies(csrfResponse)
    expect(cookies.find((cookie) => cookie.startsWith('cim.sid='))).toMatch(
      /HttpOnly/i,
    )
    expect(cookies.find((cookie) => cookie.startsWith('cim.sid='))).toMatch(
      /SameSite=Lax/i,
    )
    expect(cookies.find((cookie) => cookie.startsWith('cim.csrf='))).toMatch(
      /HttpOnly/i,
    )
    const csrfToken = csrfResponse.body.data.csrfToken as string
    const sessionBeforeLogin = getSessionId(csrfResponse)

    const rejectedLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .send({ email: testEmail, password: testPassword })

    expect(rejectedLogin.status).toBe(403)
    expect(rejectedLogin.body.error.code).toBe('CSRF_INVALID')

    const loginResponse = await client
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: testEmail, password: testPassword })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.data.user).toEqual({
      id: expect.any(String),
      email: testEmail,
    })
    expect(loginResponse.body.data.user).not.toHaveProperty('passwordHash')
    expect(typeof loginResponse.body.data.csrfToken).toBe('string')
    const sessionAfterLogin = getSessionId(loginResponse)
    expect(sessionAfterLogin).not.toBe(sessionBeforeLogin)

    const meResponse = await client.get('/api/auth/me')
    expect(meResponse.status).toBe(200)
    expect(meResponse.body.data.user.email).toBe(testEmail)

    const inquiryCsrfResponse = await client.get('/api/auth/csrf')
    const inquiryCsrfToken = inquiryCsrfResponse.body.data.csrfToken as string
    const createInquiryResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', inquiryCsrfToken)
      .send({
        customerName: 'Test Customer',
        contact: 'test-customer@example.test',
        subject: 'Test inquiry',
        description: 'A test-only customer inquiry',
      })

    expect(createInquiryResponse.status).toBe(201)
    expect(createInquiryResponse.body.data.inquiry).toMatchObject({
      createdByEmail: testEmail,
      customerName: 'Test Customer',
      contact: 'test-customer@example.test',
      subject: 'Test inquiry',
      status: 'NEW',
      allowedNextStatuses: ['IN_PROGRESS'],
      version: 1,
    })

    const secondUserClient = request.agent(app)
    const secondUserCsrf = await secondUserClient.get('/api/auth/csrf')
    getSessionId(secondUserCsrf)
    const secondUserLogin = await secondUserClient
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', secondUserCsrf.body.data.csrfToken as string)
      .send({ email: secondTestEmail, password: testPassword })
    expect(secondUserLogin.status).toBe(200)
    getSessionId(secondUserLogin)

    const secondUserList = await secondUserClient.get('/api/inquiries')
    expect(secondUserList.status).toBe(200)
    expect(secondUserList.body.data).toHaveLength(1)
    expect(secondUserList.body.data[0].id).toBe(
      createInquiryResponse.body.data.inquiry.id,
    )
    const onlyMineList = await secondUserClient
      .get('/api/inquiries')
      .query({ createdBy: 'MINE' })
    expect(onlyMineList.status).toBe(200)
    expect(onlyMineList.body.data).toEqual([])

    const sharedInquiryId = createInquiryResponse.body.data.inquiry.id as string
    const sharedDetail = await secondUserClient.get(
      `/api/inquiries/${sharedInquiryId}`,
    )
    expect(sharedDetail.status).toBe(200)
    expect(sharedDetail.body.data.inquiry.id).toBe(sharedInquiryId)

    const missingUpdateCsrf = await client.get('/api/auth/csrf')
    const missingUpdateResponse = await client
      .patch(`/api/inquiries/${randomUUID()}/status`)
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', missingUpdateCsrf.body.data.csrfToken as string)
      .send({ status: 'IN_PROGRESS', expectedVersion: 1 })
    expect(missingUpdateResponse.status).toBe(404)
    expect(missingUpdateResponse.body.error.code).toBe('INQUIRY_NOT_FOUND')

    const invalidContactCsrf = await client.get('/api/auth/csrf')
    const invalidContactResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', invalidContactCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Test Customer',
        contact: '123-abc',
        subject: 'Invalid contact',
        description: 'This should not be saved',
      })

    expect(invalidContactResponse.status).toBe(400)
    expect(invalidContactResponse.body.error.code).toBe('VALIDATION_ERROR')
    expect(invalidContactResponse.body.error.fieldErrors.contact).toBeDefined()

    const extraFieldCsrf = await client.get('/api/auth/csrf')
    const extraFieldResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', extraFieldCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Test Customer',
        contact: '+1 (555) 123-4567',
        subject: 'Unknown field',
        description: 'Unknown fields are rejected',
        createdById: randomUUID(),
      })

    expect(extraFieldResponse.status).toBe(400)
    expect(extraFieldResponse.body.error.fieldErrors._form).toBeDefined()

    const inquiriesResponse = await client.get('/api/inquiries')
    expect(inquiriesResponse.status).toBe(200)
    expect(inquiriesResponse.body.data).toEqual([
      createInquiryResponse.body.data.inquiry,
    ])
    expect(inquiriesResponse.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    })

    await pool.query(
      `UPDATE inquiries
       SET created_at = now() - interval '2 days'
       WHERE id = $1`,
      [createInquiryResponse.body.data.inquiry.id],
    )

    const duplicateCsrf = await client.get('/api/auth/csrf')
    const duplicateResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', duplicateCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Test Customer',
        contact: 'test-customer@example.test',
        subject: 'Test inquiry',
        description: 'A test-only customer inquiry',
      })
    expect(duplicateResponse.status).toBe(409)
    expect(duplicateResponse.body.error.code).toBe('DUPLICATE_SUBMISSION')
    expect(duplicateResponse.body.error.existingInquiry).toMatchObject({
      id: createInquiryResponse.body.data.inquiry.id,
      createdByEmail: testEmail,
      subject: 'Test inquiry',
      status: 'NEW',
      createdAt: expect.any(String),
    })

    const similarCsrf = await client.get('/api/auth/csrf')
    const similarResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', similarCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Test Customer',
        contact: 'test-customer@example.test',
        subject: 'Test inquiry',
        description: 'A different follow-up about the same inquiry',
      })
    expect(similarResponse.status).toBe(409)
    expect(similarResponse.body.error.code).toBe('DUPLICATE_SUBMISSION')
    expect(similarResponse.body.error.existingInquiry.id).toBe(
      createInquiryResponse.body.data.inquiry.id,
    )
    expect(similarResponse.body.error.message).toContain('not saved')

    const validPhoneCsrf = await client.get('/api/auth/csrf')
    const validPhoneResponse = await client
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', validPhoneCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Phone Customer',
        contact: '+1 (555) 123-4567',
        subject: 'Phone contact accepted',
        description: 'A valid phone contact is accepted',
      })

    expect(validPhoneResponse.status).toBe(201)
    expect(validPhoneResponse.body.data.inquiry.contact).toBe(
      '+1 (555) 123-4567',
    )

    const searchResponse = await client
      .get('/api/inquiries')
      .query({ search: 'test', status: 'NEW', sort: 'oldest' })
    expect(searchResponse.status).toBe(200)
    expect(searchResponse.body.data).toHaveLength(1)
    expect(searchResponse.body.data[0].subject).toBe('Test inquiry')

    const customerSearchResponse = await client
      .get('/api/inquiries')
      .query({ search: 'Phone Customer' })
    expect(customerSearchResponse.status).toBe(200)
    expect(customerSearchResponse.body.data).toHaveLength(1)

    const invalidListFilter = await client
      .get('/api/inquiries')
      .query({ status: 'CLOSED' })
    expect(invalidListFilter.status).toBe(400)
    expect(invalidListFilter.body.error.code).toBe('VALIDATION_ERROR')
    expect(invalidListFilter.body.error.fieldErrors.status).toBeDefined()

    const invalidCreatorFilter = await client
      .get('/api/inquiries')
      .query({ createdBy: testEmail })
    expect(invalidCreatorFilter.status).toBe(400)
    expect(invalidCreatorFilter.body.error.fieldErrors.createdBy).toBeDefined()

    const paginatedResponse = await client
      .get('/api/inquiries')
      .query({ page: 1, pageSize: 1 })
    expect(paginatedResponse.status).toBe(200)
    expect(paginatedResponse.body.data).toHaveLength(1)
    expect(paginatedResponse.body.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    })

    const cappedPageSizeResponse = await client
      .get('/api/inquiries')
      .query({ pageSize: 100 })
    expect(cappedPageSizeResponse.status).toBe(200)
    expect(cappedPageSizeResponse.body.pagination.pageSize).toBe(50)

    const injectionSearchResponse = await client
      .get('/api/inquiries')
      .query({ search: "'; DROP TABLE inquiries;--" })
    expect(injectionSearchResponse.status).toBe(200)
    expect(injectionSearchResponse.body.data).toEqual([])

    const crossStaffDuplicateCsrf = await secondUserClient.get('/api/auth/csrf')
    const crossStaffDuplicate = await secondUserClient
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set(
        'X-CSRF-Token',
        crossStaffDuplicateCsrf.body.data.csrfToken as string,
      )
      .send({
        customerName: 'Test Customer',
        contact: 'test-customer@example.test',
        subject: 'Test inquiry',
        description: 'A test-only customer inquiry',
      })
    expect(crossStaffDuplicate.status).toBe(409)
    expect(crossStaffDuplicate.body.error.code).toBe('DUPLICATE_SUBMISSION')
    expect(crossStaffDuplicate.body.error.message).toContain('not saved')
    expect(crossStaffDuplicate.body.error.existingInquiry).toMatchObject({
      id: createInquiryResponse.body.data.inquiry.id,
      createdByEmail: testEmail,
      subject: 'Test inquiry',
      status: 'NEW',
    })

    const ownInquiryList = await secondUserClient
      .get('/api/inquiries')
      .query({ createdBy: 'MINE' })
    expect(ownInquiryList.status).toBe(200)
    expect(ownInquiryList.body.data).toEqual([])
    const noDuplicateSaved = await secondUserClient
      .get('/api/inquiries')
      .query({ search: 'Test inquiry' })
    expect(noDuplicateSaved.status).toBe(200)
    expect(noDuplicateSaved.body.data).toHaveLength(1)
    expect(noDuplicateSaved.body.pagination.total).toBe(1)

    const sharedDuplicateDetail = await secondUserClient.get(
      `/api/inquiries/${createInquiryResponse.body.data.inquiry.id as string}`,
    )
    expect(sharedDuplicateDetail.status).toBe(200)
    expect(sharedDuplicateDetail.body.data.inquiry.createdByEmail).toBe(
      testEmail,
    )

    const detailResponse = await client.get(
      `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}`,
    )
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.data.inquiry.id).toBe(
      createInquiryResponse.body.data.inquiry.id,
    )

    const malformedIdResponse = await client.get('/api/inquiries/not-a-uuid')
    expect(malformedIdResponse.status).toBe(400)
    expect(malformedIdResponse.body.error.code).toBe('INVALID_ID')

    const missingInquiryResponse = await client.get(
      `/api/inquiries/${randomUUID()}`,
    )
    expect(missingInquiryResponse.status).toBe(404)
    expect(missingInquiryResponse.body.error.code).toBe('INQUIRY_NOT_FOUND')

    const updateCsrfResponse = await client.get('/api/auth/csrf')
    const updateResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', updateCsrfResponse.body.data.csrfToken as string)
      .send({
        status: 'IN_PROGRESS',
        expectedVersion: createInquiryResponse.body.data.inquiry.version,
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.inquiry.status).toBe('IN_PROGRESS')
    expect(updateResponse.body.data.inquiry.version).toBe(2)
    expect(updateResponse.body.data.inquiry.allowedNextStatuses).toEqual([
      'RESOLVED',
    ])

    const invalidTransitionCsrf = await client.get('/api/auth/csrf')
    const invalidTransitionResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', invalidTransitionCsrf.body.data.csrfToken as string)
      .send({ status: 'NEW', expectedVersion: 2 })

    expect(invalidTransitionResponse.status).toBe(422)
    expect(invalidTransitionResponse.body.error.code).toBe(
      'INVALID_STATUS_TRANSITION',
    )

    const staleVersionCsrf = await client.get('/api/auth/csrf')
    const staleVersionResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', staleVersionCsrf.body.data.csrfToken as string)
      .send({ status: 'RESOLVED', expectedVersion: 1 })

    expect(staleVersionResponse.status).toBe(409)
    expect(staleVersionResponse.body.error.code).toBe('STALE_VERSION')

    const sameStatusCsrf = await client.get('/api/auth/csrf')
    const sameStatusResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', sameStatusCsrf.body.data.csrfToken as string)
      .send({ status: 'IN_PROGRESS', expectedVersion: 2 })

    expect(sameStatusResponse.status).toBe(200)
    expect(sameStatusResponse.body.data.inquiry.status).toBe('IN_PROGRESS')
    expect(sameStatusResponse.body.data.inquiry.version).toBe(2)
    expect(sameStatusResponse.body.data.inquiry.updatedAt).toBe(
      updateResponse.body.data.inquiry.updatedAt,
    )
    expect(sameStatusResponse.body.data.inquiry.statusChangedAt).toBe(
      updateResponse.body.data.inquiry.statusChangedAt,
    )

    const resolveCsrf = await client.get('/api/auth/csrf')
    const resolveResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', resolveCsrf.body.data.csrfToken as string)
      .send({ status: 'RESOLVED', expectedVersion: 2 })

    expect(resolveResponse.status).toBe(200)
    expect(resolveResponse.body.data.inquiry.status).toBe('RESOLVED')
    expect(resolveResponse.body.data.inquiry.version).toBe(3)
    expect(resolveResponse.body.data.inquiry.allowedNextStatuses).toEqual([
      'IN_PROGRESS',
    ])

    const reopenCsrf = await client.get('/api/auth/csrf')
    const reopenResponse = await client
      .patch(
        `/api/inquiries/${createInquiryResponse.body.data.inquiry.id}/status`,
      )
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', reopenCsrf.body.data.csrfToken as string)
      .send({ status: 'IN_PROGRESS', expectedVersion: 3 })

    expect(reopenResponse.status).toBe(200)
    expect(reopenResponse.body.data.inquiry.status).toBe('IN_PROGRESS')
    expect(reopenResponse.body.data.inquiry.version).toBe(4)

    const unauthorizedInquiriesResponse =
      await request(app).get('/api/inquiries')
    expect(unauthorizedInquiriesResponse.status).toBe(401)
    expect(unauthorizedInquiriesResponse.body.error.code).toBe(
      'UNAUTHENTICATED',
    )

    const logoutCsrfResponse = await client.get('/api/auth/csrf')
    const logoutResponse = await client
      .post('/api/auth/logout')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', logoutCsrfResponse.body.data.csrfToken as string)

    expect(logoutResponse.status).toBe(200)
    expect(logoutResponse.body.data.loggedOut).toBe(true)
    expect(logoutResponse.body.data).not.toHaveProperty('user')
    const sessionAfterLogout = getSessionId(logoutResponse)
    expect(sessionAfterLogout).not.toBe(sessionAfterLogin)
    expect((await client.get('/api/auth/me')).status).toBe(401)
  })

  // Prevent account enumeration by returning the same error for both failures.
  it('returns the same generic error for an unknown account and a wrong password', async () => {
    const app = createApp()
    const client = request.agent(app)
    const csrfResponse = await client.get('/api/auth/csrf')
    getSessionId(csrfResponse)
    const csrfToken = csrfResponse.body.data.csrfToken as string

    const wrongPassword = await client
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: testEmail, password: 'incorrect-password' })

    const unknownAccount = await client
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: `unknown-${randomUUID()}@example.test`,
        password: 'incorrect-password',
      })

    expect(wrongPassword.status).toBe(401)
    expect(unknownAccount.status).toBe(401)
    expect(unknownAccount.body).toEqual(wrongPassword.body)
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  // Prove shared status updates work while rejecting an older staff snapshot.
  it('allows shared updates and rejects a stale version across staff accounts', async () => {
    const app = createApp()
    const firstTab = request.agent(app)
    const secondTab = request.agent(app)

    const firstCsrf = await firstTab.get('/api/auth/csrf')
    getSessionId(firstCsrf)
    const firstLogin = await firstTab
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', firstCsrf.body.data.csrfToken as string)
      .send({ email: testEmail, password: testPassword })
    expect(firstLogin.status).toBe(200)
    getSessionId(firstLogin)

    const secondCsrf = await secondTab.get('/api/auth/csrf')
    getSessionId(secondCsrf)
    const secondLogin = await secondTab
      .post('/api/auth/login')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', secondCsrf.body.data.csrfToken as string)
      .send({ email: secondTestEmail, password: testPassword })
    expect(secondLogin.status).toBe(200)
    getSessionId(secondLogin)

    const createCsrf = await firstTab.get('/api/auth/csrf')
    const createResponse = await firstTab
      .post('/api/inquiries')
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', createCsrf.body.data.csrfToken as string)
      .send({
        customerName: 'Concurrent Update Customer',
        contact: 'concurrent-update@example.test',
        subject: `Concurrent update ${randomUUID()}`,
        description: 'An integration test for stale updates across sessions',
      })
    expect(createResponse.status).toBe(201)

    const inquiryId = createResponse.body.data.inquiry.id as string
    const [firstSnapshot, secondSnapshot] = await Promise.all([
      firstTab.get(`/api/inquiries/${inquiryId}`),
      secondTab.get(`/api/inquiries/${inquiryId}`),
    ])
    expect(firstSnapshot.status).toBe(200)
    expect(firstSnapshot.body.data.inquiry).toMatchObject({
      status: 'NEW',
      version: 1,
    })
    expect(secondSnapshot.body.data.inquiry).toMatchObject({
      status: 'NEW',
      version: 1,
    })

    const secondUpdateCsrf = await secondTab.get('/api/auth/csrf')
    const secondUpdate = await secondTab
      .patch(`/api/inquiries/${inquiryId}/status`)
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', secondUpdateCsrf.body.data.csrfToken as string)
      .send({ status: 'IN_PROGRESS', expectedVersion: 1 })
    expect(secondUpdate.status).toBe(200)
    expect(secondUpdate.body.data.inquiry).toMatchObject({
      status: 'IN_PROGRESS',
      version: 2,
    })

    const firstUpdateCsrf = await firstTab.get('/api/auth/csrf')
    const staleUpdate = await firstTab
      .patch(`/api/inquiries/${inquiryId}/status`)
      .set('Origin', webOrigin)
      .set('X-CSRF-Token', firstUpdateCsrf.body.data.csrfToken as string)
      .send({ status: 'RESOLVED', expectedVersion: 1 })
    expect(staleUpdate.status).toBe(409)
    expect(staleUpdate.body.error.code).toBe('STALE_VERSION')

    const refreshedInquiry = await firstTab.get(`/api/inquiries/${inquiryId}`)
    expect(refreshedInquiry.status).toBe(200)
    expect(refreshedInquiry.body.data.inquiry).toMatchObject({
      status: 'IN_PROGRESS',
      version: 2,
      allowedNextStatuses: ['RESOLVED'],
    })
  })

  // Reject cross-origin writes before they can reach authentication handlers.
  it('rejects state-changing requests from an untrusted origin', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: testEmail, password: testPassword })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED')
  })
})
