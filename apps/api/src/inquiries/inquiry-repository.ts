import { pool } from '../db/pool.js'
import type { PoolClient } from 'pg'
import type { InquirySort, InquiryStatus } from './inquiry.constants.js'

export type Inquiry = {
  id: string
  createdByEmail: string
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
  created_by_email: string
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
  createdBy: 'ALL' | 'MINE'
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

export type DuplicateInquiryMatch = Pick<
  Inquiry,
  'id' | 'createdByEmail' | 'subject' | 'status' | 'createdAt'
>

/** Convert a database row from snake_case to the API's inquiry shape. */
function toInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    createdByEmail: row.created_by_email,
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
  id, created_by_id, customer_name, contact, subject, description, status,
  version, created_at, updated_at, status_changed_at
`

const inquirySelectFields = `
  i.id, u.email AS created_by_email, i.customer_name, i.contact, i.subject,
  i.description, i.status, i.version, i.created_at, i.updated_at,
  i.status_changed_at
`

/** Search, filter, sort, and paginate inquiries in the shared staff inbox. */
export async function listInquiries(
  userId: string,
  options: InquiryListOptions,
): Promise<InquiryListResult> {
  const values: (string | number)[] = []
  const conditions: string[] = []

  if (options.search !== '') {
    // Escape LIKE wildcards so search text is treated literally.
    const escapedSearch = options.search.replace(
      /[\\%_]/g,
      (character) => `\\${character}`,
    )
    values.push(`%${escapedSearch}%`)
    const searchParameter = `$${values.length}`
    conditions.push(
      `(i.customer_name ILIKE ${searchParameter} ESCAPE E'\\\\' OR i.subject ILIKE ${searchParameter} ESCAPE E'\\\\')`,
    )
  }

  if (options.status !== 'ALL') {
    values.push(options.status)
    conditions.push(`i.status = $${values.length}`)
  }

  if (options.createdBy === 'MINE') {
    values.push(userId)
    conditions.push(`i.created_by_id = $${values.length}`)
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : 'TRUE'
  const countResult = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM inquiries i WHERE ${whereClause}`,
    values,
  )
  const total = countResult.rows[0]?.total ?? 0
  // Sort SQL comes only from this fixed map, never from raw query input.
  const sortSql: Record<InquirySort, string> = {
    newest: 'i.created_at DESC, i.id DESC',
    oldest: 'i.created_at ASC, i.id ASC',
    customerName: 'i.customer_name ASC, i.created_at DESC, i.id DESC',
    subject: 'i.subject ASC, i.created_at DESC, i.id DESC',
  }
  const listValues = [
    ...values,
    options.pageSize,
    (options.page - 1) * options.pageSize,
  ]
  const limitParameter = `$${listValues.length - 1}`
  const offsetParameter = `$${listValues.length}`
  const listResult = await pool.query<InquiryRow>(
    `SELECT ${inquirySelectFields}
     FROM inquiries i
     JOIN users u ON u.id = i.created_by_id
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

/** Find an inquiry matching the submitted contact and subject at any age. */
export async function findDuplicateInquiry(
  client: PoolClient,
  input: {
    contact: string
    subject: string
  },
): Promise<DuplicateInquiryMatch | null> {
  const result = await client.query<{
    id: string
    created_by_email: string
    subject: string
    status: InquiryStatus
    created_at: Date
  }>(
    `SELECT i.id, u.email AS created_by_email, i.subject, i.status, i.created_at
     FROM inquiries i
     JOIN users u ON u.id = i.created_by_id
     WHERE i.contact = $1
       AND i.subject = $2
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 1`,
    [input.contact, input.subject],
  )

  const candidate = result.rows[0]
  return candidate === undefined
    ? null
    : {
        id: candidate.id,
        createdByEmail: candidate.created_by_email,
        subject: candidate.subject,
        status: candidate.status,
        createdAt: candidate.created_at,
      }
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
    `WITH inserted AS (
       INSERT INTO inquiries (customer_name, contact, subject, description, created_by_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${inquiryFields}
     )
     SELECT i.id, u.email AS created_by_email, i.customer_name, i.contact,
       i.subject, i.description, i.status, i.version, i.created_at,
       i.updated_at, i.status_changed_at
     FROM inserted i
     JOIN users u ON u.id = i.created_by_id`,
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

/** Find an inquiry by ID for any authenticated staff member. */
export async function findInquiryById(
  inquiryId: string,
): Promise<Inquiry | null> {
  const result = await pool.query<InquiryRow>(
    `SELECT ${inquirySelectFields}
     FROM inquiries i
     JOIN users u ON u.id = i.created_by_id
     WHERE i.id = $1`,
    [inquiryId],
  )
  const inquiry = result.rows[0]

  return inquiry === undefined ? null : toInquiry(inquiry)
}

/** Atomically update status only when the expected version still matches. */
export async function updateInquiryStatus(
  inquiryId: string,
  status: InquiryStatus,
  expectedVersion: number,
): Promise<Inquiry | null> {
  const result = await pool.query<InquiryRow>(
    `WITH updated AS (
       UPDATE inquiries
       SET status = $2,
           version = version + 1,
           updated_at = now(),
           status_changed_at = CASE
             WHEN status <> $2::varchar THEN now()
             ELSE status_changed_at
           END
       WHERE id = $1 AND version = $3
       RETURNING ${inquiryFields}
     )
     SELECT ${inquirySelectFields}
     FROM updated i
     JOIN users u ON u.id = i.created_by_id`,
    [inquiryId, status, expectedVersion],
  )
  const inquiry = result.rows[0]

  return inquiry === undefined ? null : toInquiry(inquiry)
}
