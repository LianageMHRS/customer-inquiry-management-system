import {
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

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

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

  it('submits search and status filters as inquiry-list query parameters', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockResolvedValueOnce({
        data: [],
        pagination: { ...pagination, total: 0, totalPages: 0 },
      })
      .mockResolvedValueOnce({
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
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        '/api/inquiries?search=delivery+delay&status=IN_PROGRESS&page=1&pageSize=10',
        { method: 'GET' },
      )
    })
    expect(
      await screen.findByText(
        'No inquiries match these filters. Try a different search or status.',
      ),
    ).toBeTruthy()
  })

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

  it('refreshes the list and reports a stale status conflict', async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ data: { user } })
      .mockResolvedValueOnce({ data: [inquiry], pagination })
      .mockRejectedValueOnce(
        new ApiError('Changed elsewhere', 409, 'STALE_VERSION'),
      )
      .mockResolvedValueOnce({
        data: [{ ...inquiry, status: 'IN_PROGRESS', version: 2 }],
        pagination,
      })

    renderApp()
    await screen.findByText(inquiry.subject)
    fireEvent.change(screen.getByLabelText('Status:'), {
      target: { value: 'IN_PROGRESS' },
    })

    expect(
      await screen.findByText(
        'This inquiry changed elsewhere. The latest status is now shown.',
      ),
    ).toBeTruthy()
    await waitFor(() => {
      expect(
        mockedApiRequest.mock.calls.filter(([path]) =>
          path.startsWith('/api/inquiries?'),
        ),
      ).toHaveLength(2)
    })
  })
})
