import { z } from 'zod'
import { INQUIRY_FIELD_LIMITS } from '@customer-inquiry/shared/inquiry'

const phonePattern = /^\+?(?:[0-9][0-9\s()-]*[0-9]|[0-9])$/

const contactSchema = z
  .string()
  .trim()
  .min(1, 'This field is required.')
  .max(
    INQUIRY_FIELD_LIMITS.contact,
    `Use ${INQUIRY_FIELD_LIMITS.contact} characters or fewer.`,
  )
  // Accept email or a phone number with the required digit count.
  .refine((contact) => {
    if (z.email().safeParse(contact).success) {
      return true
    }

    const digitCount = contact.replace(/\D/g, '').length
    return phonePattern.test(contact) && digitCount >= 7 && digitCount <= 15
  }, 'Enter a valid email address or a phone number with 7–15 digits.')

/** Build a trimmed, non-empty text validator with a shared length limit. */
function requiredText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(maxLength, `Use ${maxLength} characters or fewer.`)
}

export const inquiryFormSchema = z
  .object({
    customerName: requiredText(INQUIRY_FIELD_LIMITS.customerName),
    contact: contactSchema,
    subject: requiredText(INQUIRY_FIELD_LIMITS.subject),
    description: requiredText(INQUIRY_FIELD_LIMITS.description),
  })
  .strict()

export type InquiryFormValues = z.infer<typeof inquiryFormSchema>
