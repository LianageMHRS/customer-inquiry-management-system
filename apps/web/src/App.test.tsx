import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, apiRequest } from './api/client.js'
import App from './App.js'
import type { Inquiry } from './types/inquiry.js'

vi.mock('./api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client.js')>()
  return {
    ...actual,
    apiRequest: vi.fn(),
  }
})

const mockedApiRequest = vi.mocked(apiRequest)

const user = {
  id: 'staff-1',
  email: 'staff@example.com',
}

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

const pagination = {
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
}

/** Render the full application inside an in-memory router for navigation tests. */
function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  // Reset rendered DOM and mocks so each app scenario starts cleanly.
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
    vi.useRealTimers()
  })

  // Verify a valid login loads the authenticated inquiry dashboard.
  it('signs in and loads the inquiry dashboard', async () => {
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Not signed in', 401, 'UNAUTHORIZED'))
      .mockResolvedValueOnce({ data: { user, csrfToken: 'csrf-token' } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })

    renderApp()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Inquiries' }),
    ).toBeTruthy()
    expect(await screen.findByText(inquiry.subject)).toBeTruthy()
    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          password: 'correct-password',
        }),
      }),
      { ignoreUnauthorized: true },
    )
  })

  // Keep the entered email visible while showing a rejected-login message.
  it('shows a sign-in error and keeps the email when credentials are rejected', async () => {
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Not signed in', 401, 'UNAUTHORIZED'))
      .mockRejectedValueOnce(
        new ApiError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'),
      )

    renderApp()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid email or password.')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', user.email)
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeTruthy()
  })

  it('shows clear guidance when sign-in attempts are rate limited', async () => {
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Not signed in', 401, 'UNAUTHORIZED'))
      .mockRejectedValueOnce(
        new ApiError('Too many sign-in attempts', 429, 'RATE_LIMITED'),
      )

    renderApp()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Sign-in temporarily unavailable',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Please wait for the 15-minute limit window to reset',
    )
    expect(screen.getByLabelText('Email')).toHaveProperty('value', user.email)
  })

  // Confirm a failed list request can be retried without reloading the app.
  it('retries a failed inquiry-list request from the dashboard', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce({ data: [inquiry], pagination })

    renderApp()

    expect(await screen.findByText('Service unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(inquiry.subject)).toBeTruthy()
    await waitFor(() => {
      expect(
        mockedApiRequest.mock.calls.filter(([path]) =>
          path.startsWith('/api/inquiries?'),
        ),
      ).toHaveLength(2)
    })
  })

  it('refreshes the visible inbox and announces changes from another staff member', async () => {
    vi.useFakeTimers()
    const updatedInquiry: Inquiry = {
      ...inquiry,
      createdByEmail: 'another-staff@example.com',
      status: 'IN_PROGRESS',
      allowedNextStatuses: ['RESOLVED'],
      version: 2,
    }
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockResolvedValueOnce({ data: [updatedInquiry], pagination })

    renderApp()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getAllByText('staff@example.com')).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.getByText('another-staff@example.com')).toBeTruthy()
    expect(
      screen.getByText(/The team inbox changed\. New or updated inquiries/),
    ).toBeTruthy()
  })

  it('keeps current rows visible and offers retry when a background check fails', async () => {
    vi.useFakeTimers()
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ data: [inquiry], pagination })

    renderApp()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(inquiry.subject)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.getByText(inquiry.subject)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not check for new inbox updates: Network unavailable',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(
      screen.queryByText(/Could not check for new inbox updates/),
    ).toBeNull()
    expect(screen.getByText(inquiry.subject)).toBeTruthy()
  })

  // Ensure search, status, and creator filters are sent to the API.
  it('submits search, status, and created-by filters as list query parameters', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockResolvedValue({
        data: [],
        pagination: { ...pagination, total: 0, totalPages: 0 },
      })

    renderApp()

    await screen.findByText(inquiry.subject)
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'delivery delay' },
    })
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'IN_PROGRESS' },
    })
    fireEvent.change(screen.getByLabelText('Created by'), {
      target: { value: 'MINE' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        '/api/inquiries?search=delivery+delay&status=IN_PROGRESS&createdBy=MINE&page=1&pageSize=10',
        { method: 'GET' },
      )
    })
    expect(
      await screen.findByRole('heading', { name: 'No matching inquiries' }),
    ).toBeTruthy()
  })

  // Show server field errors on the form and retain values for correction.
  it('shows API field errors and preserves values after a failed create', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockRejectedValueOnce(
        new ApiError('Please correct the contact.', 422, 'VALIDATION_ERROR', {
          contact: ['Contact was rejected by the server.'],
        }),
      )

    renderApp()
    await screen.findByText(inquiry.subject)
    fireEvent.click(screen.getByRole('button', { name: 'New inquiry' }))

    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: 'Taylor Customer' },
    })
    fireEvent.change(screen.getByLabelText('Contact (email or phone)'), {
      target: { value: 'taylor@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Order question' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Please check my order.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save inquiry' }))

    expect(
      await screen.findByText('Contact was rejected by the server.'),
    ).toBeTruthy()
    expect(screen.getByLabelText('Contact (email or phone)')).toHaveProperty(
      'value',
      'taylor@example.com',
    )
    expect(
      screen
        .getByLabelText('Contact (email or phone)')
        .getAttribute('aria-invalid'),
    ).toBe('true')
  })

  it('does not save a duplicate and links to the existing inquiry', async () => {
    const existingInquiry: Inquiry = {
      ...inquiry,
      id: '7c0ed57b-3d3a-4664-b9a6-2cf2870bebc4',
      createdByEmail: 'another-staff@example.com',
      status: 'IN_PROGRESS',
      allowedNextStatuses: ['RESOLVED'],
      version: 2,
    }
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockRejectedValueOnce(
        new ApiError(
          'A matching inquiry already exists. This submission was not saved.',
          409,
          'DUPLICATE_SUBMISSION',
          {},
          {
            existingInquiry: {
              id: existingInquiry.id,
              createdByEmail: existingInquiry.createdByEmail,
              subject: existingInquiry.subject,
              status: existingInquiry.status,
              createdAt: existingInquiry.createdAt,
            },
          },
        ),
      )

    renderApp()
    await screen.findByText(inquiry.subject)
    fireEvent.click(screen.getByRole('button', { name: 'New inquiry' }))
    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: 'Taylor Customer' },
    })
    fireEvent.change(screen.getByLabelText('Contact (email or phone)'), {
      target: { value: 'taylor@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: inquiry.subject },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A different description for the possible duplicate.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save inquiry' }))

    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('Duplicate inquiry — not saved')
    expect(warning.textContent).toContain('all dates')
    expect(warning.textContent).toContain('another-staff@example.com')
    expect(warning.textContent).toContain('In progress')
    expect(
      screen
        .getByRole('link', { name: 'Review existing inquiry' })
        .getAttribute('href'),
    ).toBe(`/inquiries/${existingInquiry.id}`)
    expect(screen.getByLabelText('Description')).toHaveProperty(
      'value',
      'A different description for the possible duplicate.',
    )
    expect(
      mockedApiRequest.mock.calls.filter(([path]) =>
        path.startsWith('/api/inquiries?'),
      ),
    ).toHaveLength(1)
  })

  // Refresh stale data and prominently tell staff another update won.
  it('refreshes the list and reports a stale status conflict', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockRejectedValueOnce(
        new ApiError('Changed elsewhere', 409, 'STALE_VERSION'),
      )
      .mockResolvedValueOnce({
        data: [
          {
            ...inquiry,
            status: 'IN_PROGRESS',
            allowedNextStatuses: ['RESOLVED'],
            version: 2,
          },
        ],
        pagination,
      })

    renderApp()
    await screen.findByText(inquiry.subject)
    fireEvent.change(screen.getByLabelText('Status:'), {
      target: { value: 'IN_PROGRESS' },
    })

    const conflictNotice = await screen.findByRole('alert')
    expect(conflictNotice.textContent).toContain(
      'This inquiry was updated elsewhere',
    )
    expect(conflictNotice.textContent).toContain(
      'We refreshed the list with the latest status.',
    )
    expect(
      screen
        .getByRole('region', { name: 'Team inquiries' })
        .contains(conflictNotice),
    ).toBe(true)
    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toHaveProperty(
        'value',
        'IN_PROGRESS',
      )
      expect(
        mockedApiRequest.mock.calls.filter(([path]) =>
          path.startsWith('/api/inquiries?'),
        ),
      ).toHaveLength(2)
    })
    expect(mockedApiRequest).toHaveBeenCalledWith(
      `/api/inquiries/${inquiry.id}/status`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'IN_PROGRESS',
          expectedVersion: inquiry.version,
        }),
      }),
    )
  })
})
