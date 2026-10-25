import { AppError } from '../errors/app-error.js'
import {
  INQUIRY_STATUS_TRANSITIONS,
  type InquiryStatus,
} from './inquiry.constants.js'
import {
  findRecentExactDuplicate,
  findInquiryForUser,
  hasSimilarRecentInquiry,
  insertInquiry,
  listInquiriesForUser as queryInquiriesForUser,
  updateInquiryStatus as saveInquiryStatus,
  type InquiryListOptions,
  type InquiryListResult,
  type Inquiry,
} from './inquiry-repository.js'
import { withTransaction } from '../db/pool.js'

export type InquiryResponse = Inquiry & {
  allowedNextStatuses: InquiryStatus[]
}

export type InquiryResponseList = Omit<InquiryListResult, 'inquiries'> & {
  inquiries: InquiryResponse[]
}

/** Add the allowed next status choices derived from the current lifecycle. */
function toInquiryResponse(inquiry: Inquiry): InquiryResponse {
  return {
    ...inquiry,
    allowedNextStatuses: [...INQUIRY_STATUS_TRANSITIONS[inquiry.status]],
  }
}

/** Fetch a filtered, paginated list and expose allowed transitions per row. */
export async function listInquiriesForUser(
  userId: string,
  options: InquiryListOptions,
): Promise<InquiryResponseList> {
  const result = await queryInquiriesForUser(userId, options)
  return {
    ...result,
    inquiries: result.inquiries.map(toInquiryResponse),
  }
}

/** Return one inquiry only when it belongs to the requesting staff member. */
export async function getInquiryForUser(
  userId: string,
  inquiryId: string,
): Promise<InquiryResponse> {
  const inquiry = await findInquiryForUser(userId, inquiryId)

  if (inquiry === null) {
    throw new AppError(404, 'INQUIRY_NOT_FOUND', 'Inquiry was not found')
  }

  return toInquiryResponse(inquiry)
}

/** Create an inquiry while blocking exact repeats and warning on similar ones. */
export async function createInquiry(
  userId: string,
  input: {
    customerName: string
    contact: string
    subject: string
    description: string
  },
): Promise<{
  inquiry: InquiryResponse
  warnings: { code: 'POSSIBLE_DUPLICATE' }[]
}> {
  const created = await withTransaction(async (client) => {
    const lockKey = JSON.stringify([
      userId,
      input.contact,
      input.subject,
      input.description,
    ])
    // Serialize matching submissions so concurrent retries cannot both pass
    // the duplicate check before either insert is visible.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [lockKey],
    )

    const existingInquiryId = await findRecentExactDuplicate(
      client,
      userId,
      input,
    )

    if (existingInquiryId !== null) {
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        'This inquiry was just submitted',
        undefined,
        { existingInquiryId },
      )
    }

    const isSimilarInquiry = await hasSimilarRecentInquiry(
      client,
      userId,
      input,
    )
    const inquiry = await insertInquiry(client, userId, input)

    return {
      inquiry,
      warnings: isSimilarInquiry
        ? [{ code: 'POSSIBLE_DUPLICATE' as const }]
        : [],
    }
  })

  return {
    inquiry: toInquiryResponse(created.inquiry),
    warnings: created.warnings,
  }
}

/** Enforce lifecycle and version rules before persisting a status change. */
export async function changeInquiryStatus(
  userId: string,
  inquiryId: string,
  requestedStatus: InquiryStatus,
  expectedVersion: number,
): Promise<InquiryResponse> {
  const current = await findInquiryForUser(userId, inquiryId)

  if (current === null) {
    throw new AppError(404, 'INQUIRY_NOT_FOUND', 'Inquiry was not found')
  }

  if (current.version !== expectedVersion) {
    throw new AppError(
      409,
      'STALE_VERSION',
      'This inquiry was changed elsewhere. Refresh it before updating again.',
    )
  }

  // Same-status requests are harmless and should not create a new version.
  if (current.status === requestedStatus) {
    return toInquiryResponse(current)
  }

  if (!INQUIRY_STATUS_TRANSITIONS[current.status].includes(requestedStatus)) {
    throw new AppError(
      422,
      'INVALID_STATUS_TRANSITION',
      `An inquiry cannot move from ${current.status} to ${requestedStatus}`,
    )
  }

  const updated = await saveInquiryStatus(
    userId,
    inquiryId,
    requestedStatus,
    expectedVersion,
  )

  if (updated !== null) {
    return toInquiryResponse(updated)
  }

  // Another request may win after the earlier read; treat that race as stale.
  const latest = await findInquiryForUser(userId, inquiryId)

  if (latest === null) {
    throw new AppError(404, 'INQUIRY_NOT_FOUND', 'Inquiry was not found')
  }

  throw new AppError(
    409,
    'STALE_VERSION',
    'This inquiry was changed elsewhere. Refresh it before updating again.',
  )
}
