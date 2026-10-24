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

function toInquiryResponse(inquiry: Inquiry): InquiryResponse {
  return {
    ...inquiry,
    allowedNextStatuses: [...INQUIRY_STATUS_TRANSITIONS[inquiry.status]],
  }
}

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
