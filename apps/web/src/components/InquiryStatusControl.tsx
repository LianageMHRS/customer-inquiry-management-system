import {
  INQUIRY_STATUSES,
  type InquiryStatus,
} from '@customer-inquiry/shared/inquiry'
import { inquiryStatusLabels, type Inquiry } from '../types/inquiry.js'

type InquiryStatusControlProps = {
  inquiry: Inquiry
  disabled: boolean
  onStatusChange: (inquiry: Inquiry, status: InquiryStatus) => void
}

export function InquiryStatusControl({
  inquiry,
  disabled,
  onStatusChange,
}: InquiryStatusControlProps) {
  const availableStatuses = INQUIRY_STATUSES.filter(
    (status) =>
      status === inquiry.status || inquiry.allowedNextStatuses.includes(status),
  )

  return (
    <label
      className={`status-control status-${inquiry.status.toLowerCase().replace('_', '-')}`}
      htmlFor={`status-${inquiry.id}`}
    >
      <span className="status-dot" aria-hidden="true" />
      <span className="visually-hidden">Status:</span>
      <select
        id={`status-${inquiry.id}`}
        value={inquiry.status}
        disabled={disabled}
        onChange={(event) => {
          const selectedStatus = INQUIRY_STATUSES.find(
            (status) => status === event.target.value,
          )

          if (selectedStatus !== undefined) {
            onStatusChange(inquiry, selectedStatus)
          }
        }}
      >
        {availableStatuses.map((status) => (
          <option key={status} value={status}>
            {inquiry.status === 'RESOLVED' && status === 'IN_PROGRESS'
              ? 'Reopen'
              : inquiryStatusLabels[status]}
          </option>
        ))}
      </select>
    </label>
  )
}
