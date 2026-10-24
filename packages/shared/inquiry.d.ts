export const INQUIRY_FIELD_LIMITS: Readonly<{
  customerName: 100
  contact: 254
  subject: 150
  description: 2000
  search: 100
}>

export const INQUIRY_STATUSES: readonly ['NEW', 'IN_PROGRESS', 'RESOLVED']

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]
