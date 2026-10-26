import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Inquiry } from '../types/inquiry.js'
import { InquiryResults, type InquiryPagination } from './InquiryResults.js'

const inquiry: Inquiry = {
  id: 'inquiry-123',
  createdByEmail: 'staff@example.com',
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
        onCreateInquiry={vi.fn()}
        onClearFilters={vi.fn()}
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

  // Show a visible, accessible progress indicator while the list loads.
  it('shows a loading spinner and message while inquiries are loading', () => {
    const { container } = renderResults({ isLoading: true })

    expect(screen.getByRole('status').textContent).toContain(
      'Loading inquiries...',
    )
    expect(container.querySelector('.loading-spinner')).not.toBeNull()
  })

  // Give users an appropriate next action for each empty-list situation.
  it('shows helpful empty states for a new inbox and filters with no matches', () => {
    const onCreateInquiry = vi.fn()
    const { rerender } = renderResults({ inquiries: [], onCreateInquiry })
    expect(
      screen.getByRole('heading', { name: 'No inquiries yet' }),
    ).toBeTruthy()
    expect(screen.getByText(/Create the first one to get started/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create an inquiry' }))
    expect(onCreateInquiry).toHaveBeenCalledOnce()

    const onClearFilters = vi.fn()
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
          onCreateInquiry={vi.fn()}
          onClearFilters={onClearFilters}
          onRetry={vi.fn()}
          onPageChange={vi.fn()}
          onStatusChange={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'No matching inquiries' }),
    ).toBeTruthy()
    expect(screen.getByText(/Try changing your search or filters/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClearFilters).toHaveBeenCalledOnce()
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
    expect(screen.getByText(inquiry.createdByEmail)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe(`/inquiries/${inquiry.id}`)
    expect(
      screen.queryByRole('navigation', { name: 'Inquiry pages' }),
    ).toBeNull()
  })
})
