const requestTimeoutMs = 10_000
export const UNAUTHENTICATED_EVENT = 'api:unauthenticated'
const csrfHeaderName = 'X-CSRF-Token'

export type ApiFieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: ApiFieldErrors

  constructor(
    message: string,
    status: number,
    code: string,
    fieldErrors: ApiFieldErrors = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

type ApiRequestOptions = {
  ignoreUnauthorized?: boolean
}

/** Narrow unknown JSON values before reading API response properties. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Parse response JSON or report a typed error for malformed responses. */
async function parseResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ApiError(
      'The server returned a response that could not be read.',
      response.status,
      'INVALID_RESPONSE',
    )
  }
}

/** Keep only valid string-array field messages from an unknown payload. */
function getFieldErrors(value: unknown): ApiFieldErrors {
  if (!isRecord(value)) {
    return {}
  }

  const fieldErrors: ApiFieldErrors = {}
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      const validMessages = messages.filter(
        (message): message is string => typeof message === 'string',
      )
      if (validMessages.length > 0) {
        fieldErrors[field] = validMessages
      }
    }
  }

  return fieldErrors
}

/** Convert the server error envelope into the client's typed error class. */
async function createApiError(
  response: Response,
  ignoreUnauthorized: boolean,
): Promise<ApiError> {
  const payload: unknown = await parseResponseJson(response)
  const apiError = isRecord(payload) ? payload.error : null
  const message =
    isRecord(apiError) && typeof apiError.message === 'string'
      ? apiError.message
      : `The request failed with status ${response.status}.`
  const code =
    isRecord(apiError) && typeof apiError.code === 'string'
      ? apiError.code
      : 'REQUEST_FAILED'
  const fieldErrors =
    isRecord(apiError) && 'fieldErrors' in apiError
      ? getFieldErrors(apiError.fieldErrors)
      : {}

  if (response.status === 401 && !ignoreUnauthorized) {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT))
  }

  return new ApiError(message, response.status, code, fieldErrors)
}

/** Send a credentialed request and normalize network and API failures. */
async function sendRequest(
  path: string,
  init: RequestInit,
  ignoreUnauthorized: boolean,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(
        'The request took too long. Please try again.',
        0,
        'REQUEST_TIMEOUT',
      )
    }

    throw new ApiError(
      'Could not connect to the service. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    throw await createApiError(response, ignoreUnauthorized)
  }

  return parseResponseJson(response)
}

/** Fetch and validate the CSRF token required for state-changing requests. */
async function getCsrfToken(): Promise<string> {
  const result: unknown = await sendRequest(
    '/api/auth/csrf',
    { method: 'GET' },
    true,
  )

  if (
    !isRecord(result) ||
    !isRecord(result.data) ||
    typeof result.data.csrfToken !== 'string'
  ) {
    throw new ApiError(
      'The server did not provide a valid security token.',
      0,
      'INVALID_CSRF_RESPONSE',
    )
  }

  return result.data.csrfToken
}

/** Make a typed API request, adding CSRF protection to mutations. */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const headers = new Headers(init.headers)

  if (isMutation) {
    // The server requires a fresh CSRF token alongside the session cookie.
    headers.set(csrfHeaderName, await getCsrfToken())
  }

  return (await sendRequest(
    path,
    { ...init, headers },
    options.ignoreUnauthorized ?? false,
  )) as T
}

/** Type guard for API errors consumed by interface components. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
