import { pool } from '../db/pool.js'
import type { PoolClient } from 'pg'
import type { InquirySort, InquiryStatus } from './inquiry.constants.js'

export type Inquiry = {
  id: string
  customerName: string
  contact: string
  subject: string
  description: string
  status: InquiryStatus
  version: number
  createdAt: Date
  updatedAt: Date
  statusChangedAt: Date
}

type InquiryRow = {
  id: string
  customer_name: string
  contact: string
  subject: string
  description: string
  status: InquiryStatus
  version: number
  created_at: Date
  updated_at: Date
  status_changed_at: Date
}

export type InquiryListOptions = {
  search: string
  status: InquiryStatus | 'ALL'
  page: number
  pageSize: number
  sort: InquirySort
}

export type InquiryListResult = {
  inquiries: Inquiry[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Convert a database row from snake_case to the API's inquiry shape. */
function toInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    customerName: row.customer_name,
    contact: row.contact,
    subject: row.subject,
    description: row.description,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at,
  }
}

const inquiryFields = `
  id, customer_name, contact, subject, description, status, version,
  created_at, updated_at, status_changed_at
`

/** Search, filter, sort, and paginate inquiries belonging to one staff member. */
export async function listInquiriesForUser(
  userId: string,
  options: InquiryListOptions,
): Promise<InquiryListResult> {
  // Keep every list query owner-scoped; browser-supplied IDs never choose it.
  const values: (string | number)[] = [userId]
  const conditions = ['created_by_id = $1']

  if (options.search !== '') {
    // Escape LIKE wildcards so search text is treated literally.
    const escapedSearch = options.search.replace(
      /[\\%_]/g,
      (character) => `\\${character}`,
    )
    values.push(`%${escapedSearch}%`)
    const searchParameter = `$${values.length}`
    conditions.push(
      `(customer_name ILIKE ${searchParameter} ESCAPE E'\\\\' OR subject ILIKE ${searchParameter} ESCAPE E'\\\\')`,
    )
  }

  if (options.status !== 'ALL') {
    values.push(options.status)
    conditions.push(`status = $${values.length}`)
  }

  const whereClause = conditions.join(' AND ')
  const countResult = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM inquiries WHERE ${whereClause}`,
    values,
  )
  const total = countResult.rows[0]?.total ?? 0
  // Sort SQL comes only from this fixed map, never from raw query input.
  const sortSql: Record<InquirySort, string> = {
    newest: 'created_at DESC, id DESC',
    oldest: 'created_at ASC, id ASC',
    customerName: 'customer_name ASC, created_at DESC, id DESC',
    subject: 'subject ASC, created_at DESC, id DESC',
  }
  const listValues = [
    ...values,
    options.pageSize,
    (options.page - 1) * options.pageSize,
  ]
  const limitParameter = `$${listValues.length - 1}`
  const offsetParameter = `$${listValues.length}`
  const listResult = await pool.query<InquiryRow>(
    `SELECT ${inquiryFields}
     FROM inquiries
     WHERE ${whereClause}
     ORDER BY ${sortSql[options.sort]}
     LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    listValues,
  )

  return {
    inquiries: listResult.rows.map(toInquiry),
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.ceil(total / options.pageSize),
    },
  }
}

/** Find an exact same-owner submission made within the duplicate window. */
export async function findRecentExactDuplicate(
  client: PoolClient,
  userId: string,
  input: {
    contact: string
    subject: string
    description: string
  },
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM inquiries
     WHERE created_by_id = $1
       AND contact = $2
       AND subject = $3
       AND description = $4
       AND created_at >= now() - interval '30 seconds'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, input.contact, input.subject, input.description],
  )

  return result.rows[0]?.id ?? null
}

/** Detect a recent same-contact-and-subject inquiry for a warning. */
export async function hasSimilarRecentInquiry(
  client: PoolClient,
  userId: string,
  input: {
    contact: string
    subject: string
  },
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM inquiries
     WHERE created_by_id = $1
       AND contact = $2
       AND subject = $3
       AND created_at >= now() - interval '24 hours'
     LIMIT 1`,
    [userId, input.contact, input.subject],
  )

  return result.rowCount === 1
}

/** Insert a new inquiry and return its normalized database representation. */
export async function insertInquiry(
  client: PoolClient,
  userId: string,
  input: {
    customerName: string
    contact: string
    subject: string
    description: string
  },
): Promise<Inquiry> {
  const result = await client.query<InquiryRow>(
    `INSERT INTO inquiries (customer_name, contact, subject, description, created_by_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${inquiryFields}`,
    [
      input.customerName,
      input.contact,
      input.subject,
      input.description,
      userId,
    ],
  )
  const inquiry = result.rows[0]

  if (inquiry === undefined) {
    throw new Error('Created inquiry was not returned by the database')
  }

  return toInquiry(inquiry)
}

/** Find an inquiry only if it is owned by the specified staff account. */
export async function findInquiryForUser(
  userId: string,
  inquiryId: string,
): Promise<Inquiry | null> {
  // Match the version in the UPDATE itself to prevent a read/write race.
  const result = await pool.query<InquiryRow>(
    `SELECT ${inquiryFields}
     FROM inquiries
     WHERE id = $1 AND created_by_id = $2`,
    [inquiryId, userId],
  )
  const inquiry = result.rows[0]

  return inquiry === undefined ? null : toInquiry(inquiry)
}

/** Atomically update status only when owner and expected version still match. */
export async function updateInquiryStatus(
  userId: string,
  inquiryId: string,
  status: InquiryStatus,
  expectedVersion: number,
): Promise<Inquiry | null> {
  const result = await pool.query<InquiryRow>(
    `UPDATE inquiries
     SET status = $3,
         version = version + 1,
         updated_at = now(),
         status_changed_at = CASE
           WHEN status <> $3::varchar THEN now()
           ELSE status_changed_at
         END
     WHERE id = $1 AND created_by_id = $2 AND version = $4
     RETURNING ${inquiryFields}`,
    [inquiryId, userId, status, expectedVersion],
  )
  const inquiry = result.rows[0]

  return inquiry === undefined ? null : toInquiry(inquiry)
}
