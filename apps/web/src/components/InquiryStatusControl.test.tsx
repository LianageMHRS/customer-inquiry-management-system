import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Inquiry } from '../types/inquiry.js'
import { InquiryStatusControl } from './InquiryStatusControl.js'

const resolvedInquiry: Inquiry = {
  id: 'inquiry-123',
  customerName: 'Taylor Customer',
  contact: 'taylor@example.com',
  subject: 'Question about an order',
  description: 'The order arrived later than expected.',
  status: 'RESOLVED',
  allowedNextStatuses: ['IN_PROGRESS'],
  version: 3,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
}

describe('InquiryStatusControl', () => {
  // Ensure the resolved inquiry can be unmounted between transition checks.
  afterEach(() => {
    cleanup()
  })

  // Use the clear Reopen label for the resolved-to-in-progress transition.
  it('labels the allowed transition from resolved as Reopen', () => {
    render(
      <InquiryStatusControl
        inquiry={resolvedInquiry}
        disabled={false}
        onStatusChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Reopen' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'In progress' })).toBeNull()
  })

  // Send the valid reopen transition through the supplied change handler.
  it('sends the resolved inquiry through the existing reopen transition', () => {
    const onStatusChange = vi.fn()

    render(
      <InquiryStatusControl
        inquiry={resolvedInquiry}
        disabled={false}
        onStatusChange={onStatusChange}
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'IN_PROGRESS' },
    })

    expect(onStatusChange).toHaveBeenCalledWith(resolvedInquiry, 'IN_PROGRESS')
  })
})
