import {
  INQUIRY_STATUSES,
  type InquiryStatus,
} from '@customer-inquiry/shared/inquiry'

export { INQUIRY_STATUSES }
export type { InquiryStatus }

export const INQUIRY_SORT_OPTIONS = [
  'newest',
  'oldest',
  'customerName',
  'subject',
] as const

export type InquirySort = (typeof INQUIRY_SORT_OPTIONS)[number]

export const DEFAULT_INQUIRY_PAGE_SIZE = 10
export const MAX_INQUIRY_PAGE_SIZE = 50

export const INQUIRY_STATUS_TRANSITIONS: Record<
  InquiryStatus,
  readonly InquiryStatus[]
> = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['IN_PROGRESS'],
}
