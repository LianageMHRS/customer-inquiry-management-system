import { useEffect, useState, type FormEvent } from 'react'
import {
  INQUIRY_FIELD_LIMITS,
  INQUIRY_STATUSES,
  type InquiryStatus,
} from '@customer-inquiry/shared/inquiry'

type User = {
  id: string
  email: string
}

const inquiryStatusLabels: Record<InquiryStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
}

const inquiryStatuses = INQUIRY_STATUSES.map((value) => ({
  value,
  label: inquiryStatusLabels[value],
}))

const inquiryFieldLimits = {
  customerName: INQUIRY_FIELD_LIMITS.customerName,
  contact: INQUIRY_FIELD_LIMITS.contact,
  subject: INQUIRY_FIELD_LIMITS.subject,
  description: INQUIRY_FIELD_LIMITS.description,
}

type InquiryField = keyof typeof inquiryFieldLimits
type InquiryFieldErrors = Partial<Record<InquiryField, string | undefined>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateInquiryField(
  field: InquiryField,
  value: string,
): string | undefined {
  const trimmedValue = value.trim()

  if (trimmedValue === '') {
    return 'This field is required.'
  }

  if (value.length > inquiryFieldLimits[field]) {
    return `Use ${inquiryFieldLimits[field]} characters or fewer.`
  }

  if (field === 'contact') {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)
    const digitCount = trimmedValue.replace(/\D/g, '').length
    const isPhone =
      /^\+?(?:[0-9][0-9\s()-]*[0-9]|[0-9])$/.test(trimmedValue) &&
      digitCount >= 7 &&
      digitCount <= 15

    if (!isEmail && !isPhone) {
      return 'Enter a valid email address or a phone number with 7–15 digits.'
    }
  }

  return undefined
}

type Inquiry = {
  id: string
  customerName: string
  contact: string
  subject: string
  description: string
  status: InquiryStatus
  allowedNextStatuses: InquiryStatus[]
  version: number
  createdAt: string
}

type AuthResponse = {
  data: {
    user: User
    csrfToken: string
  }
}

type CsrfResponse = {
  data: {
    csrfToken: string
  }
}

async function getErrorMessage(
  response: Response,
  onFieldErrors?: (errors: InquiryFieldErrors) => void,
): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)

  if (isRecord(payload) && isRecord(payload.error)) {
    if (typeof payload.error.message === 'string') {
      if (onFieldErrors !== undefined && isRecord(payload.error.fieldErrors)) {
        const fieldErrors: InquiryFieldErrors = {}
        for (const field of Object.keys(inquiryFieldLimits) as InquiryField[]) {
          const messages = payload.error.fieldErrors[field]
          if (Array.isArray(messages) && typeof messages[0] === 'string') {
            fieldErrors[field] = messages[0]
          }
        }
        onFieldErrors(fieldErrors)
      }

      return payload.error.message
    }
  }

  return 'Something went wrong. Please try again.'
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  const result = (await response.json()) as CsrfResponse
  return result.data.csrfToken
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contact, setContact] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [inquiryFieldErrors, setInquiryFieldErrors] =
    useState<InquiryFieldErrors>({})
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function checkSignedInUser() {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        })

        if (response.status === 401) {
          return
        }

        if (!response.ok) {
          throw new Error(await getErrorMessage(response))
        }

        const result = (await response.json()) as { data: { user: User } }

        if (isMounted) {
          setUser(result.data.user)
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not connect to the sign-in service.',
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void checkSignedInUser()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (user === null) {
      setInquiries([])
      return
    }

    let isMounted = true

    async function loadInquiries() {
      setIsLoadingInquiries(true)

      try {
        const response = await fetch('/api/inquiries', {
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error(await getErrorMessage(response))
        }

        const result = (await response.json()) as { data: Inquiry[] }

        if (isMounted) {
          setInquiries(result.data)
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not load your inquiries.',
          )
        }
      } finally {
        if (isMounted) {
          setIsLoadingInquiries(false)
        }
      }
    }

    void loadInquiries()

    return () => {
      isMounted = false
    }
  }, [user])

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsSubmitting(true)

    try {
      const csrfToken = await getCsrfToken()
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const result = (await response.json()) as AuthResponse
      setUser(result.data.user)
      setPassword('')
      setMessage('You are signed in.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not connect to the sign-in service.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setMessage('')
    setIsSubmitting(true)

    try {
      const csrfToken = await getCsrfToken()
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken },
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      setUser(null)
      setMessage('You are signed out.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not sign out. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const values = { customerName, contact, subject, description }
    const validationErrors: InquiryFieldErrors = {}
    for (const field of Object.keys(inquiryFieldLimits) as InquiryField[]) {
      const error = validateInquiryField(field, values[field])
      if (error !== undefined) {
        validationErrors[field] = error
      }
    }

    setInquiryFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      setMessage('Please check the highlighted fields and try again.')
      return
    }

    setIsSubmitting(true)

    try {
      const csrfToken = await getCsrfToken()
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ customerName, contact, subject, description }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, setInquiryFieldErrors))
      }

      const result = (await response.json()) as {
        data: {
          inquiry: Inquiry
          warnings: { code: string }[]
        }
      }
      setInquiries((current) => [result.data.inquiry, ...current])
      setCustomerName('')
      setContact('')
      setSubject('')
      setDescription('')
      setInquiryFieldErrors({})
      setIsCreateFormOpen(false)
      setMessage(
        result.data.warnings.some(({ code }) => code === 'POSSIBLE_DUPLICATE')
          ? 'Inquiry added. A similar inquiry was submitted recently.'
          : 'Inquiry added.',
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not add the inquiry. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStatusChange(inquiry: Inquiry, status: InquiryStatus) {
    setMessage('')
    setIsSubmitting(true)

    try {
      const csrfToken = await getCsrfToken()
      const response = await fetch(`/api/inquiries/${inquiry.id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          status,
          expectedVersion: inquiry.version,
        }),
      })

      if (!response.ok) {
        if (response.status === 409) {
          const refreshResponse = await fetch('/api/inquiries', {
            credentials: 'include',
          })

          if (!refreshResponse.ok) {
            throw new Error(await getErrorMessage(refreshResponse))
          }

          const refreshed = (await refreshResponse.json()) as {
            data: Inquiry[]
          }
          setInquiries(refreshed.data)
          setMessage(
            'This inquiry changed elsewhere. The latest status is now shown.',
          )
          return
        }

        throw new Error(await getErrorMessage(response))
      }

      const result = (await response.json()) as {
        data: { inquiry: Inquiry }
      }
      setInquiries((current) =>
        current.map((item) =>
          item.id === inquiry.id ? result.data.inquiry : item,
        ),
      )
      setMessage('Inquiry status updated.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not update the inquiry. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="auth-card">
        <p className="eyebrow">Customer Inquiry Management</p>
        <p role="status">Checking your sign-in...</p>
      </main>
    )
  }

  if (user === null) {
    return (
      <main className="auth-card sign-in-card">
        <p className="eyebrow">Customer Inquiry Management</p>
        <section aria-labelledby="sign-in-title">
          <h1 id="sign-in-title">Staff sign in</h1>
          <p className="description">
            Sign in with the staff account created for this project.
          </p>
          <form onSubmit={(event) => void handleSignIn(event)}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
            />
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
        <p className="feedback" role="status" aria-live="polite">
          {message}
        </p>
      </main>
    )
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#inquiries" aria-label="Customer inquiries">
          <span className="brand-mark" aria-hidden="true">
            CI
          </span>
          <span className="brand-name">Inquiry Desk</span>
        </a>
        <p className="sidebar-caption">WORKSPACE</p>
        <a className="nav-link nav-link-active" href="#inquiries">
          <span className="nav-icon" aria-hidden="true">
            ▤
          </span>
          Inquiries
        </a>
        <div className="sidebar-footer">
          <span className="sidebar-user-mark" aria-hidden="true">
            {user.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="sidebar-user-email">{user.email}</span>
        </div>
      </aside>

      <div className="dashboard-content">
        <header className="topbar">
          <p className="breadcrumb">
            Workspace <span aria-hidden="true">/</span>{' '}
            <strong>Inquiries</strong>
          </p>
          <div className="topbar-actions">
            <span className="signed-in-label">Signed in</span>
            <button
              className="button button-secondary sign-out-button"
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>

        <main className="dashboard-main" id="inquiries">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CUSTOMER SUPPORT</p>
              <h1>Inquiries</h1>
              <p className="page-subtitle">
                Review and manage customer inquiries created by your account.
              </p>
            </div>
            <button
              className="button new-inquiry-button"
              type="button"
              aria-expanded={isCreateFormOpen}
              aria-controls="new-inquiry-form"
              onClick={() => setIsCreateFormOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true">＋</span>
              {isCreateFormOpen ? 'Close form' : 'New inquiry'}
            </button>
          </div>

          {isCreateFormOpen && (
            <section
              className="panel create-panel"
              aria-labelledby="new-inquiry-title"
              id="new-inquiry-form"
            >
              <div className="panel-heading">
                <div>
                  <h2 id="new-inquiry-title">Create an inquiry</h2>
                  <p>Add the customer's details and a short description.</p>
                </div>
              </div>
              <form
                className="inquiry-form"
                onSubmit={(event) => void handleCreateInquiry(event)}
                noValidate
              >
                <div className="form-field">
                  <label htmlFor="customer-name">Customer name</label>
                  <input
                    id="customer-name"
                    value={customerName}
                    onChange={(event) => {
                      const value = event.target.value
                      setCustomerName(value)
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        customerName: validateInquiryField(
                          'customerName',
                          value,
                        ),
                      }))
                    }}
                    onBlur={() =>
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        customerName: validateInquiryField(
                          'customerName',
                          customerName,
                        ),
                      }))
                    }
                    maxLength={inquiryFieldLimits.customerName}
                    aria-invalid={inquiryFieldErrors.customerName !== undefined}
                    aria-describedby={
                      inquiryFieldErrors.customerName !== undefined
                        ? 'customer-name-error'
                        : 'customer-name-hint'
                    }
                  />
                  {inquiryFieldErrors.customerName ? (
                    <span className="field-error" id="customer-name-error">
                      {inquiryFieldErrors.customerName}
                    </span>
                  ) : (
                    <span className="field-hint" id="customer-name-hint">
                      Up to {inquiryFieldLimits.customerName} characters.
                    </span>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="contact">Contact (email or phone)</label>
                  <input
                    id="contact"
                    value={contact}
                    onChange={(event) => {
                      const value = event.target.value
                      setContact(value)
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        contact: validateInquiryField('contact', value),
                      }))
                    }}
                    onBlur={() =>
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        contact: validateInquiryField('contact', contact),
                      }))
                    }
                    maxLength={inquiryFieldLimits.contact}
                    aria-invalid={inquiryFieldErrors.contact !== undefined}
                    aria-describedby={
                      inquiryFieldErrors.contact !== undefined
                        ? 'contact-error'
                        : 'contact-hint'
                    }
                  />
                  {inquiryFieldErrors.contact ? (
                    <span className="field-error" id="contact-error">
                      {inquiryFieldErrors.contact}
                    </span>
                  ) : (
                    <span className="field-hint" id="contact-hint">
                      Enter an email address or phone number.
                    </span>
                  )}
                </div>
                <div className="form-field form-field-wide">
                  <label htmlFor="subject">Subject</label>
                  <input
                    id="subject"
                    value={subject}
                    onChange={(event) => {
                      const value = event.target.value
                      setSubject(value)
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        subject: validateInquiryField('subject', value),
                      }))
                    }}
                    onBlur={() =>
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        subject: validateInquiryField('subject', subject),
                      }))
                    }
                    maxLength={inquiryFieldLimits.subject}
                    aria-invalid={inquiryFieldErrors.subject !== undefined}
                    aria-describedby={
                      inquiryFieldErrors.subject !== undefined
                        ? 'subject-error'
                        : 'subject-hint'
                    }
                  />
                  {inquiryFieldErrors.subject ? (
                    <span className="field-error" id="subject-error">
                      {inquiryFieldErrors.subject}
                    </span>
                  ) : (
                    <span className="field-hint" id="subject-hint">
                      Up to {inquiryFieldLimits.subject} characters.
                    </span>
                  )}
                </div>
                <div className="form-field form-field-wide">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(event) => {
                      const value = event.target.value
                      setDescription(value)
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        description: validateInquiryField('description', value),
                      }))
                    }}
                    onBlur={() =>
                      setInquiryFieldErrors((current) => ({
                        ...current,
                        description: validateInquiryField(
                          'description',
                          description,
                        ),
                      }))
                    }
                    maxLength={inquiryFieldLimits.description}
                    rows={3}
                    aria-invalid={inquiryFieldErrors.description !== undefined}
                    aria-describedby={
                      inquiryFieldErrors.description !== undefined
                        ? 'description-error'
                        : 'description-hint'
                    }
                  />
                  {inquiryFieldErrors.description ? (
                    <span className="field-error" id="description-error">
                      {inquiryFieldErrors.description}
                    </span>
                  ) : (
                    <span className="field-hint" id="description-hint">
                      Up to {inquiryFieldLimits.description} characters.
                    </span>
                  )}
                </div>
                <div className="form-actions form-field-wide">
                  <button
                    className="button"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : 'Save inquiry'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section
            className="panel inquiries-panel"
            aria-labelledby="list-title"
          >
            <div className="panel-heading list-heading">
              <div>
                <h2 id="list-title">Your inquiries</h2>
                <p>Inquiries created by your staff account.</p>
              </div>
              <span className="record-count">
                {inquiries.length}{' '}
                {inquiries.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            {isLoadingInquiries ? (
              <p className="table-message" role="status">
                Loading your inquiries...
              </p>
            ) : inquiries.length === 0 ? (
              <p className="table-message">
                You have not added any inquiries yet.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="inquiry-table">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Created</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inquiries.map((inquiry) => (
                      <tr key={inquiry.id}>
                        <td className="inquiry-id">
                          #{inquiry.id.slice(0, 6).toUpperCase()}
                        </td>
                        <td>
                          <span className="table-subject">
                            {inquiry.subject}
                          </span>
                          <span className="table-description">
                            {inquiry.description}
                          </span>
                        </td>
                        <td>
                          <span className="table-customer">
                            {inquiry.customerName}
                          </span>
                          <span className="table-contact">
                            {inquiry.contact}
                          </span>
                        </td>
                        <td className="created-date">
                          {new Date(inquiry.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <label
                            className={`status-control status-${inquiry.status.toLowerCase().replace('_', '-')}`}
                            htmlFor={`status-${inquiry.id}`}
                          >
                            <span className="status-dot" aria-hidden="true" />
                            <span className="visually-hidden">Status:</span>
                            <select
                              id={`status-${inquiry.id}`}
                              value={inquiry.status}
                              disabled={isSubmitting}
                              onChange={(event) => {
                                const selectedStatus = inquiryStatuses.find(
                                  ({ value }) => value === event.target.value,
                                )

                                if (selectedStatus !== undefined) {
                                  void handleStatusChange(
                                    inquiry,
                                    selectedStatus.value,
                                  )
                                }
                              }}
                            >
                              {inquiryStatuses
                                .filter(
                                  ({ value }) =>
                                    value === inquiry.status ||
                                    inquiry.allowedNextStatuses.includes(value),
                                )
                                .map(({ value, label }) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="feedback" role="status" aria-live="polite">
            {message}
          </p>
        </main>
      </div>
    </div>
  )
}

export default App
