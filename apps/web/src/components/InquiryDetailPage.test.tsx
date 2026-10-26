import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, apiRequest } from '../api/client.js'
import type { Inquiry } from '../types/inquiry.js'
import { InquiryDetailPage } from './InquiryDetailPage.js'

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client.js')>()
  return {
    ...actual,
    apiRequest: vi.fn(),
  }
})

const mockedApiRequest = vi.mocked(apiRequest)

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

/** Mount the inquiry detail route with a stable test inquiry ID. */
function renderDetailPage() {
  return render(
    <MemoryRouter>
      <InquiryDetailPage inquiryId={inquiry.id} />
    </MemoryRouter>,
  )
}

describe('InquiryDetailPage', () => {
  // Reset request mocks before each detail-loading scenario.
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // Remove mounted React trees after each test.
  afterEach(() => {
    cleanup()
  })

  // Keep a visible loading spinner until the detail request resolves.
  it('shows a loading spinner while the inquiry request is pending', () => {
    mockedApiRequest.mockReturnValue(new Promise(() => {}))

    const { container } = renderDetailPage()

    expect(
      screen.getByRole('heading', { name: 'Loading inquiry' }),
    ).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(
      'Please wait while we retrieve the details.',
    )
    expect(container.querySelector('.loading-spinner-large')).not.toBeNull()
  })

  // Render all customer and inquiry fields from a successful response.
  it('shows inquiry details after a successful request', async () => {
    mockedApiRequest.mockResolvedValue({
      data: { inquiry },
    })

    renderDetailPage()

    expect(
      await screen.findByRole('heading', { name: inquiry.subject }),
    ).toBeTruthy()
    expect(screen.getByText(inquiry.customerName)).toBeTruthy()
    expect(screen.getByText(inquiry.contact)).toBeTruthy()
    expect(screen.getByText(inquiry.description)).toBeTruthy()
    expect(screen.getByText(inquiry.createdByEmail)).toBeTruthy()
    expect(mockedApiRequest).toHaveBeenCalledWith(
      `/api/inquiries/${encodeURIComponent(inquiry.id)}`,
      { method: 'GET' },
    )
  })

  // Avoid revealing whether an inaccessible inquiry exists to this user.
  it('shows a non-disclosing message when the inquiry is unavailable', async () => {
    mockedApiRequest.mockRejectedValue(
      new ApiError('Not found', 404, 'NOT_FOUND'),
    )

    renderDetailPage()

    expect(
      await screen.findByRole('heading', { name: 'Inquiry not found' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'This inquiry may have been removed or you may not have permission to view it.',
      ),
    ).toBeTruthy()
  })

  // Let staff retry a failed request and display details after recovery.
  it('retries after a request error and displays the inquiry when retry succeeds', async () => {
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Service unavailable', 503, 'ERROR'))
      .mockResolvedValueOnce({ data: { inquiry } })

    renderDetailPage()

    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t load this inquiry',
      }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledTimes(2)
    })
    expect(
      await screen.findByRole('heading', { name: inquiry.subject }),
    ).toBeTruthy()
  })
})
