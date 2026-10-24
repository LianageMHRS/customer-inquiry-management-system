export const INQUIRY_FIELD_LIMITS = Object.freeze({
  customerName: 100,
  contact: 254,
  subject: 150,
  description: 2000,
  search: 100,
})

export const INQUIRY_STATUSES = Object.freeze([
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
])
