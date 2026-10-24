import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, isApiError, UNAUTHENTICATED_EVENT } from './client.js'

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches and sends a CSRF token for mutation requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { csrfToken: 'csrf-value' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { loggedOut: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiRequest('/api/auth/logout', { method: 'POST' }),
    ).resolves.toEqual({ data: { loggedOut: true } })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/csrf')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/logout')
    const requestInit = fetchMock.mock.calls[1]?.[1]
    expect(new Headers(requestInit?.headers).get('X-CSRF-Token')).toBe(
      'csrf-value',
    )
    expect(requestInit?.credentials).toBe('include')
  })

  it('signals the app when a request returns an expired-session response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'Session expired', code: 'UNAUTHORIZED' },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const eventListener = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, eventListener)

    try {
      let requestError: unknown
      try {
        await apiRequest('/api/inquiries')
      } catch (error) {
        requestError = error
      }
      expect(isApiError(requestError)).toBe(true)
      if (isApiError(requestError)) {
        expect(requestError.status).toBe(401)
        expect(requestError.code).toBe('UNAUTHORIZED')
      }
      expect(eventListener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(UNAUTHENTICATED_EVENT, eventListener)
    }
  })

  it('does not signal expired session for expected unauthenticated requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'Invalid credentials', code: 'UNAUTHORIZED' },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const eventListener = vi.fn()
    window.addEventListener(UNAUTHENTICATED_EVENT, eventListener)

    try {
      await expect(
        apiRequest(
          '/api/auth/login',
          { method: 'POST' },
          {
            ignoreUnauthorized: true,
          },
        ),
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
      expect(eventListener).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(UNAUTHENTICATED_EVENT, eventListener)
    }
  })
})
