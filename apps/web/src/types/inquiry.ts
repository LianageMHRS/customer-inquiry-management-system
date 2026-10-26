import type { InquiryStatus } from '@customer-inquiry/shared/inquiry'

export type Inquiry = {
  id: string
  createdByEmail: string
  customerName: string
  contact: string
  subject: string
  description: string
  status: InquiryStatus
  allowedNextStatuses: InquiryStatus[]
  version: number
  createdAt: string
  updatedAt: string
}

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
}
