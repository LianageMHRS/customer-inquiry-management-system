import type { RequestHandler } from 'express'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { toFieldErrors } from '../errors/field-errors.js'
import {
  changeInquiryStatus,
  createInquiry,
  getInquiryForUser,
  listInquiriesForUser,
} from './inquiry-service.js'
import {
  createInquirySchema,
  inquiryListQuerySchema,
  updateStatusSchema,
} from './inquiry.schemas.js'

/** Read the authenticated owner ID from the server-managed session. */
function signedInUserId(request: Express.Request): string {
  const userId = request.session.userId

  if (userId === undefined) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in is required')
  }

  return userId
}

/** Validate list parameters and return this staff member's paged inquiries. */
export const listInquiries: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsed = inquiryListQuerySchema.safeParse(request.query)

  if (!parsed.success) {
    next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'Inquiry list filters are invalid',
        toFieldErrors(parsed.error.issues),
      ),
    )
    return
  }

  try {
    const result = await listInquiriesForUser(
      signedInUserId(request),
      parsed.data,
    )
    response.json({
      data: result.inquiries,
      pagination: result.pagination,
    })
  } catch (error) {
    next(error)
  }
}

/** Validate and create an inquiry owned by the signed-in staff member. */
export const createInquiryHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsed = createInquirySchema.safeParse(request.body)

  if (!parsed.success) {
    next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'Enter a valid customer name, contact, subject, and description',
        toFieldErrors(parsed.error.issues),
      ),
    )
    return
  }

  try {
    const result = await createInquiry(signedInUserId(request), parsed.data)
    response.status(201).json({ data: result })
  } catch (error) {
    next(error)
  }
}

/** Validate the path ID and return an owner-scoped inquiry detail. */
export const getInquiry: RequestHandler = async (request, response, next) => {
  const idResult = z.uuid().safeParse(request.params.id)

  if (!idResult.success) {
    next(new AppError(400, 'INVALID_ID', 'Inquiry ID must be a valid UUID'))
    return
  }

  try {
    const inquiry = await getInquiryForUser(
      signedInUserId(request),
      idResult.data,
    )
    response.json({ data: { inquiry } })
  } catch (error) {
    next(error)
  }
}

/** Validate and apply a status change using its expected record version. */
export const updateInquiryStatus: RequestHandler = async (
  request,
  response,
  next,
) => {
  const idResult = z.uuid().safeParse(request.params.id)
  const parsed = updateStatusSchema.safeParse(request.body)

  if (!idResult.success) {
    next(new AppError(400, 'INVALID_ID', 'Inquiry ID must be a valid UUID'))
    return
  }

  if (!parsed.success) {
    next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'A valid status and expected version are required',
        toFieldErrors(parsed.error.issues),
      ),
    )
    return
  }

  try {
    const inquiry = await changeInquiryStatus(
      signedInUserId(request),
      idResult.data,
      parsed.data.status,
      parsed.data.expectedVersion,
    )
    response.json({ data: { inquiry } })
  } catch (error) {
    next(error)
  }
}
