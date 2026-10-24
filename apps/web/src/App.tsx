import { useEffect, useState, type FormEvent } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import {
  INQUIRY_FIELD_LIMITS,
  type InquiryStatus,
} from '@customer-inquiry/shared/inquiry'
import { apiRequest, isApiError, UNAUTHENTICATED_EVENT } from './api/client.js'
import { InquiryCreateForm } from './components/InquiryCreateForm.js'
import { InquiryDetailPage } from './components/InquiryDetailPage.js'
import { SignInPage } from './components/SignInPage.js'
import {
  InquiryResults,
  type InquiryPagination,
} from './components/InquiryResults.js'
import { type InquiryFormValues } from './schemas/inquiry.schema.js'
import { inquiryStatusLabels, type Inquiry } from './types/inquiry.js'
import type { UseFormSetError } from 'react-hook-form'

type User = {
  id: string
  email: string
}

type InquiryField = keyof InquiryFormValues
const inquiryFields: readonly InquiryField[] = [
  'customerName',
  'contact',
  'subject',
  'description',
]

type InquiryListStatus = InquiryStatus | 'ALL'

function isInquiryListStatus(value: string): value is InquiryListStatus {
  return (
    value === 'ALL' ||
    Object.prototype.hasOwnProperty.call(inquiryStatusLabels, value)
  )
}

const defaultInquiryPagination: InquiryPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
}

type AuthResponse = {
  data: {
    user: User
    csrfToken: string
  }
}

function App() {
  const inquiryDetailMatch = useMatch('/inquiries/:inquiryId')
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [pagination, setPagination] = useState(defaultInquiryPagination)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InquiryListStatus>('ALL')
  const [page, setPage] = useState(1)
  const [inquiryListRefresh, setInquiryListRefresh] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false)
  const [inquiryListError, setInquiryListError] = useState('')
  const [inquiryListRetry, setInquiryListRetry] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)

  useEffect(() => {
    function handleUnauthenticated() {
      setUser(null)
      setMessage('Your session has expired. Please sign in again.')
      navigate('/', { replace: true })
    }

    window.addEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated)
    return () => {
      window.removeEventListener(UNAUTHENTICATED_EVENT, handleUnauthenticated)
    }
  }, [navigate])

  useEffect(() => {
    let isMounted = true

    async function checkSignedInUser() {
      try {
        const result = await apiRequest<{ data: { user: User } }>(
          '/api/auth/me',
          { method: 'GET' },
          { ignoreUnauthorized: true },
        )

        if (isMounted) {
          setUser(result.data.user)
        }
      } catch (error) {
        if (isMounted && !(isApiError(error) && error.status === 401)) {
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
      setPagination(defaultInquiryPagination)
      setInquiryListError('')
      return
    }

    let isMounted = true

    async function loadInquiries() {
      setIsLoadingInquiries(true)
      setInquiryListError('')

      try {
        const query = new URLSearchParams({
          search,
          status: statusFilter,
          page: String(page),
          pageSize: String(defaultInquiryPagination.pageSize),
        })
        const result = await apiRequest<{
          data: Inquiry[]
          pagination: InquiryPagination
        }>(`/api/inquiries?${query.toString()}`, { method: 'GET' })

        if (isMounted) {
          setInquiries(result.data)
          setPagination(result.pagination)
          setInquiryListError('')
        }
      } catch (error) {
        if (isMounted) {
          setInquiryListError(
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
  }, [user, search, statusFilter, page, inquiryListRefresh, inquiryListRetry])

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsSubmitting(true)

    try {
      const result = await apiRequest<AuthResponse>(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
        { ignoreUnauthorized: true },
      )
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
      await apiRequest<{ data: { loggedOut: boolean } }>('/api/auth/logout', {
        method: 'POST',
      })
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

  async function handleCreateInquiry(
    values: InquiryFormValues,
    setFieldError: UseFormSetError<InquiryFormValues>,
  ): Promise<boolean> {
    setMessage('')

    setIsSubmitting(true)

    try {
      const result = await apiRequest<{
        data: {
          inquiry: Inquiry
          warnings: { code: string }[]
        }
      }>('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      setPage(1)
      setInquiryListRefresh((current) => current + 1)
      setMessage(
        result.data.warnings.some(({ code }) => code === 'POSSIBLE_DUPLICATE')
          ? 'Inquiry added. A similar inquiry was submitted recently.'
          : 'Inquiry added.',
      )
      return true
    } catch (error) {
      if (isApiError(error)) {
        for (const field of inquiryFields) {
          const fieldMessage = error.fieldErrors[field]?.[0]
          if (fieldMessage !== undefined) {
            setFieldError(field, {
              type: 'server',
              message: fieldMessage,
            })
          }
        }
      }
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not add the inquiry. Please try again.',
      )
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStatusChange(inquiry: Inquiry, status: InquiryStatus) {
    setMessage('')
    setIsSubmitting(true)

    try {
      await apiRequest<{ data: { inquiry: Inquiry } }>(
        `/api/inquiries/${inquiry.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            expectedVersion: inquiry.version,
          }),
        },
      )

      setInquiryListRefresh((current) => current + 1)
      setMessage('Inquiry status updated.')
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setInquiryListRefresh((current) => current + 1)
        setMessage(
          'This inquiry changed elsewhere. The latest status is now shown.',
        )
        return
      }

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
      <SignInPage
        email={email}
        password={password}
        message={message}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={(event) => void handleSignIn(event)}
      />
    )
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link className="brand" to="/" aria-label="Customer inquiries">
          <span className="brand-mark" aria-hidden="true">
            CI
          </span>
          <span className="brand-name">Inquiry Desk</span>
        </Link>
        <p className="sidebar-caption">WORKSPACE</p>
        <Link className="nav-link nav-link-active" to="/">
          <span className="nav-icon" aria-hidden="true">
            ▤
          </span>
          Inquiries
        </Link>
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
          {inquiryDetailMatch?.params.inquiryId ? (
            <InquiryDetailPage
              inquiryId={inquiryDetailMatch.params.inquiryId}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">CUSTOMER SUPPORT</p>
                  <h1>Inquiries</h1>
                  <p className="page-subtitle">
                    Review and manage customer inquiries created by your
                    account.
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
                <InquiryCreateForm
                  isSubmitting={isSubmitting}
                  onSubmit={handleCreateInquiry}
                  onSuccess={() => setIsCreateFormOpen(false)}
                  onInvalid={() =>
                    setMessage(
                      'Please check the highlighted fields and try again.',
                    )
                  }
                />
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
                    {pagination.total}{' '}
                    {pagination.total === 1 ? 'record' : 'records'}
                  </span>
                </div>

                <form
                  className="inquiry-toolbar"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setSearch(searchInput.trim())
                    setPage(1)
                  }}
                >
                  <label className="search-field" htmlFor="inquiry-search">
                    <span className="visually-hidden">
                      Search by customer name or subject
                    </span>
                    <input
                      id="inquiry-search"
                      type="search"
                      value={searchInput}
                      maxLength={INQUIRY_FIELD_LIMITS.search}
                      placeholder="Search customer or subject"
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                  </label>
                  <button className="button" type="submit">
                    Search
                  </button>
                  <label className="status-filter" htmlFor="status-filter">
                    <span>Status</span>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(event) => {
                        const selectedStatus = event.target.value
                        if (isInquiryListStatus(selectedStatus)) {
                          setStatusFilter(selectedStatus)
                          setPage(1)
                        }
                      }}
                    >
                      <option value="ALL">All statuses</option>
                      {Object.entries(inquiryStatusLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {(search !== '' || statusFilter !== 'ALL') && (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setSearchInput('')
                        setSearch('')
                        setStatusFilter('ALL')
                        setPage(1)
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </form>

                <InquiryResults
                  inquiries={inquiries}
                  pagination={pagination}
                  page={page}
                  isLoading={isLoadingInquiries}
                  isSubmitting={isSubmitting}
                  errorMessage={inquiryListError}
                  hasActiveFilters={search !== '' || statusFilter !== 'ALL'}
                  onRetry={() => setInquiryListRetry((current) => current + 1)}
                  onPageChange={setPage}
                  onStatusChange={(inquiry, status) =>
                    void handleStatusChange(inquiry, status)
                  }
                />
              </section>
            </>
          )}

          <p className="feedback" role="status" aria-live="polite">
            {message}
          </p>
        </main>
      </div>
    </div>
  )
}

export default App
