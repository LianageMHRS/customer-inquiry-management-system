import { z } from 'zod'
import { INQUIRY_FIELD_LIMITS } from '@customer-inquiry/shared/inquiry'
import {
  DEFAULT_INQUIRY_PAGE_SIZE,
  INQUIRY_SORT_OPTIONS,
  INQUIRY_STATUSES,
  MAX_INQUIRY_PAGE_SIZE,
} from './inquiry.constants.js'

const phonePattern = /^\+?(?:[0-9][0-9\s()-]*[0-9]|[0-9])$/

const contactSchema = z
  .string()
  .trim()
  .min(1)
  .max(INQUIRY_FIELD_LIMITS.contact)
  .refine(
    (contact) => {
      if (z.email().safeParse(contact).success) {
        return true
      }

      const digitCount = contact.replace(/\D/g, '').length
      return phonePattern.test(contact) && digitCount >= 7 && digitCount <= 15
    },
    { message: 'Enter a valid email address or phone number' },
  )

export const createInquirySchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(1)
      .max(INQUIRY_FIELD_LIMITS.customerName),
    contact: contactSchema,
    subject: z.string().trim().min(1).max(INQUIRY_FIELD_LIMITS.subject),
    description: z.string().trim().min(1).max(INQUIRY_FIELD_LIMITS.description),
  })
  .strict()

export const updateStatusSchema = z
  .object({
    status: z.enum(INQUIRY_STATUSES),
    expectedVersion: z.number().int().positive(),
  })
  .strict()

export const inquiryListQuerySchema = z
  .object({
    search: z.string().trim().max(INQUIRY_FIELD_LIMITS.search).default(''),
    status: z.enum(['ALL', ...INQUIRY_STATUSES]).default('ALL'),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(DEFAULT_INQUIRY_PAGE_SIZE)
      .transform((pageSize) => Math.min(pageSize, MAX_INQUIRY_PAGE_SIZE)),
    sort: z.enum(INQUIRY_SORT_OPTIONS).default('newest'),
  })
  .strict()
