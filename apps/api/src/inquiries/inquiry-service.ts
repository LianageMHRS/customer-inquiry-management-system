import { AppError } from '../errors/app-error.js'
import {
  INQUIRY_STATUS_TRANSITIONS,
  type InquiryStatus,
} from './inquiry.constants.js'
import {
  findDuplicateInquiry,
  findInquiryById,
  insertInquiry,
  listInquiries as queryInquiries,
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

/** Fetch the shared filtered list and expose allowed transitions per row. */
export async function listInquiries(
  userId: string,
  options: InquiryListOptions,
): Promise<InquiryResponseList> {
  const result = await queryInquiries(userId, options)
  return {
    ...result,
    inquiries: result.inquiries.map(toInquiryResponse),
  }
}

/** Return one inquiry to any authenticated staff member. */
export async function getInquiry(inquiryId: string): Promise<InquiryResponse> {
  const inquiry = await findInquiryById(inquiryId)

  if (inquiry === null) {
    throw new AppError(404, 'INQUIRY_NOT_FOUND', 'Inquiry was not found')
  }

  return toInquiryResponse(inquiry)
}

/** Reject matching contact/subject inquiries before creating a new record. */
export async function createInquiry(
  userId: string,
  input: {
    customerName: string
    contact: string
    subject: string
    description: string
  },
): Promise<InquiryResponse> {
  return withTransaction(async (client) => {
    const normalizedContact = input.contact.trim().toLowerCase()
    const normalizedSubject = input.subject.trim().toLowerCase()
    const lockKey = JSON.stringify([normalizedContact, normalizedSubject])
    // Serialize matches across staff to prevent concurrent duplicate inserts.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [lockKey],
    )

    const existingInquiry = await findDuplicateInquiry(client, input)

    if (existingInquiry !== null) {
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        'A matching inquiry already exists. This submission was not saved.',
        undefined,
        { existingInquiry },
      )
    }

    const inquiry = await insertInquiry(client, userId, input)
    return toInquiryResponse(inquiry)
  })
}

/** Enforce lifecycle and version rules for any authenticated staff member. */
export async function changeInquiryStatus(
  inquiryId: string,
  requestedStatus: InquiryStatus,
  expectedVersion: number,
): Promise<InquiryResponse> {
  const current = await findInquiryById(inquiryId)

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
    inquiryId,
    requestedStatus,
    expectedVersion,
  )

  if (updated !== null) {
    return toInquiryResponse(updated)
  }

  // Another request may win after the earlier read; treat that race as stale.
  const latest = await findInquiryById(inquiryId)

  if (latest === null) {
    throw new AppError(404, 'INQUIRY_NOT_FOUND', 'Inquiry was not found')
  }

  throw new AppError(
    409,
    'STALE_VERSION',
    'This inquiry was changed elsewhere. Refresh it before updating again.',
  )
}
