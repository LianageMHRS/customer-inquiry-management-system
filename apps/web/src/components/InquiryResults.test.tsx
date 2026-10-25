import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Inquiry } from '../types/inquiry.js'
import { InquiryResults, type InquiryPagination } from './InquiryResults.js'

const inquiry: Inquiry = {
  id: 'inquiry-123',
  customerName: 'Taylor Customer',
  contact: 'taylor@example.com',
  subject: 'Question about an order',
  description: 'The order arrived later than expected.',
  status: 'NEW',
  allowedNextStatuses: ['IN_PROGRESS'],
  version: 1,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
}

const onePage: InquiryPagination = {
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
}

/** Render result rows with defaults that individual cases can override. */
function renderResults(
  overrides: Partial<Parameters<typeof InquiryResults>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <InquiryResults
        inquiries={[inquiry]}
        pagination={onePage}
        page={1}
        isLoading={false}
        isSubmitting={false}
        errorMessage=""
        hasActiveFilters={false}
        onRetry={vi.fn()}
        onPageChange={vi.fn()}
        onStatusChange={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('InquiryResults', () => {
  // Remove mounted result tables between display-state checks.
  afterEach(() => {
    cleanup()
  })

  // Show an accessible progress message while a list request is pending.
  it('shows a loading message while inquiries are loading', () => {
    renderResults({ isLoading: true })

    expect(screen.getByRole('status').textContent).toContain(
      'Loading your inquiries...',
    )
  })

  // Distinguish a truly empty account from filters with no matching rows.
  it('shows an empty-state message based on whether filters are active', () => {
    const { rerender } = renderResults({ inquiries: [] })
    expect(
      screen.getByText('You have not added any inquiries yet.'),
    ).toBeTruthy()

    rerender(
      <MemoryRouter>
        <InquiryResults
          inquiries={[]}
          pagination={onePage}
          page={1}
          isLoading={false}
          isSubmitting={false}
          errorMessage=""
          hasActiveFilters
          onRetry={vi.fn()}
          onPageChange={vi.fn()}
          onStatusChange={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(
        'No inquiries match these filters. Try a different search or status.',
      ),
    ).toBeTruthy()
  })

  // Hide unnecessary one-page navigation and wire multi-page controls.
  it('hides one-page controls and changes page when Next is clicked', () => {
    const singlePageRender = renderResults()
    expect(
      screen.queryByRole('navigation', { name: 'Inquiry pages' }),
    ).toBeNull()
    singlePageRender.unmount()

    const onPageChange = vi.fn()
    const pagination: InquiryPagination = {
      page: 1,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    }
    renderResults({ pagination, onPageChange })

    expect(
      screen.getByRole('navigation', { name: 'Inquiry pages' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  // Display inquiry information with a link to its detail route.
  it('shows the inquiry and its detail link', () => {
    renderResults()

    expect(screen.getByText(inquiry.subject)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe(`/inquiries/${inquiry.id}`)
    expect(
      screen.queryByRole('navigation', { name: 'Inquiry pages' }),
    ).toBeNull()
  })
})
