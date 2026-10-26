import { useEffect, useRef, useState, type FormEvent } from 'react'
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
type InquiryCreatorFilter = 'ALL' | 'MINE'
type DuplicateInquiryMatch = {
  id: string
  createdByEmail: string
  subject: string
  status: InquiryStatus
  createdAt: string
}

const INQUIRY_POLL_INTERVAL_MS = 30_000
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Check a URL-derived status before using it as an inquiry filter. */
function isInquiryListStatus(value: string): value is InquiryListStatus {
  return (
    value === 'ALL' ||
    Object.prototype.hasOwnProperty.call(inquiryStatusLabels, value)
  )
}

/** Narrow untrusted API error metadata before using it in the duplicate UI. */
function isDuplicateInquiryMatch(
  value: unknown,
): value is DuplicateInquiryMatch {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    uuidPattern.test(value.id) &&
    typeof value.createdByEmail === 'string' &&
    typeof value.subject === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.status === 'string' &&
    Object.prototype.hasOwnProperty.call(inquiryStatusLabels, value.status)
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

/** Coordinate sign-in, inquiry navigation, list state, and user actions. */
function App() {
  const inquiryDetailMatch = useMatch('/inquiries/:inquiryId')
  const isInquiryListVisible = inquiryDetailMatch === null
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [pagination, setPagination] = useState(defaultInquiryPagination)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InquiryListStatus>('ALL')
  const [creatorFilter, setCreatorFilter] =
    useState<InquiryCreatorFilter>('ALL')
  const [page, setPage] = useState(1)
  const [inquiryListRefresh, setInquiryListRefresh] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSignInRateLimited, setIsSignInRateLimited] = useState(false)
  const [conflictMessage, setConflictMessage] = useState(false)
  const [externalInboxChange, setExternalInboxChange] = useState(false)
  const [backgroundRefreshError, setBackgroundRefreshError] = useState('')
  const [duplicateInquiry, setDuplicateInquiry] =
    useState<DuplicateInquiryMatch | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false)
  const [inquiryListError, setInquiryListError] = useState('')
  const [inquiryListRetry, setInquiryListRetry] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const isBackgroundRefreshRef = useRef(false)
  const inquirySnapshotRef = useRef<{
    query: string
    total: number
    versions: Map<string, number>
  }>({ query: '', total: 0, versions: new Map() })
  const locallyChangedInquiryIdsRef = useRef(new Set<string>())

  // Turn expired-session events into a return to the sign-in screen.
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

  // Restore the existing server-side session when the app first loads.
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

  // Reload shared inquiries whenever filters or refresh state changes.
  useEffect(() => {
    if (user === null) {
      setInquiries([])
      setPagination(defaultInquiryPagination)
      setInquiryListError('')
      setBackgroundRefreshError('')
      inquirySnapshotRef.current = { query: '', total: 0, versions: new Map() }
      return
    }

    // Ignore late responses after filters change or this screen unmounts.
    let isMounted = true

    async function loadInquiries() {
      const isBackgroundRefresh = isBackgroundRefreshRef.current
      isBackgroundRefreshRef.current = false
      if (isBackgroundRefresh) {
        setBackgroundRefreshError('')
      } else {
        setIsLoadingInquiries(true)
        setInquiryListError('')
      }

      try {
        const query = new URLSearchParams({
          search,
          status: statusFilter,
          createdBy: creatorFilter,
          page: String(page),
          pageSize: String(defaultInquiryPagination.pageSize),
        })
        const result = await apiRequest<{
          data: Inquiry[]
          pagination: InquiryPagination
        }>(`/api/inquiries?${query.toString()}`, { method: 'GET' })

        if (isMounted) {
          const queryKey = query.toString()
          const previousSnapshot = inquirySnapshotRef.current
          let foundExternalChange = false
          const currentVersions = new Map(
            result.data.map((inquiry) => [inquiry.id, inquiry.version]),
          )

          if (previousSnapshot.query === queryKey) {
            if (previousSnapshot.total !== result.pagination.total) {
              foundExternalChange = true
            }
            for (const inquiry of result.data) {
              const previousVersion = previousSnapshot.versions.get(inquiry.id)
              const isKnownLocalChange =
                locallyChangedInquiryIdsRef.current.has(inquiry.id)
              if (
                !isKnownLocalChange &&
                (previousVersion === undefined ||
                  inquiry.version > previousVersion)
              ) {
                foundExternalChange = true
              }
              locallyChangedInquiryIdsRef.current.delete(inquiry.id)
            }
          }

          inquirySnapshotRef.current = {
            query: queryKey,
            total: result.pagination.total,
            versions: currentVersions,
          }
          if (foundExternalChange) {
            setExternalInboxChange(true)
          }
          setInquiries(result.data)
          setPagination(result.pagination)
          setInquiryListError('')
          setBackgroundRefreshError('')
        }
      } catch (error) {
        if (isMounted) {
          const message =
            error instanceof Error ? error.message : 'Could not load inquiries.'
          if (isBackgroundRefresh) {
            setBackgroundRefreshError(message)
          } else {
            setInquiryListError(message)
          }
        }
      } finally {
        if (isMounted && !isBackgroundRefresh) {
          setIsLoadingInquiries(false)
        }
      }
    }

    void loadInquiries()

    return () => {
      isMounted = false
    }
  }, [
    user,
    search,
    statusFilter,
    creatorFilter,
    page,
    inquiryListRefresh,
    inquiryListRetry,
  ])

  // Check for shared inbox changes every 30 seconds, but only while visible.
  useEffect(() => {
    if (user === null || !isInquiryListVisible) {
      return
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        isBackgroundRefreshRef.current = true
        setInquiryListRefresh((current) => current + 1)
      }
    }

    const intervalId = window.setInterval(
      refreshWhenVisible,
      INQUIRY_POLL_INTERVAL_MS,
    )

    return () => {
      window.clearInterval(intervalId)
    }
  }, [user, isInquiryListVisible])

  /** Sign in through the API and retain only the public staff identity. */
  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsSignInRateLimited(false)
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
      if (isApiError(error) && error.code === 'RATE_LIMITED') {
        setIsSignInRateLimited(true)
        setMessage(
          'For your security, sign-in is temporarily paused after several unsuccessful attempts. Please wait for the 15-minute limit window to reset before trying again.',
        )
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not connect to the sign-in service.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  /** End the server session and return the interface to the sign-in screen. */
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

  /** Submit validated form data and map API field errors back to the form. */
  async function handleCreateInquiry(
    values: InquiryFormValues,
    setFieldError: UseFormSetError<InquiryFormValues>,
  ): Promise<boolean> {
    setMessage('')
    setDuplicateInquiry(null)

    setIsSubmitting(true)

    try {
      const result = await apiRequest<{
        data: {
          inquiry: Inquiry
        }
      }>('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      setPage(1)
      locallyChangedInquiryIdsRef.current.add(result.data.inquiry.id)
      setExternalInboxChange(false)
      setInquiryListRefresh((current) => current + 1)
      setMessage('Inquiry added.')
      return true
    } catch (error) {
      if (isApiError(error)) {
        const duplicateInquiry = error.metadata.existingInquiry
        if (
          error.code === 'DUPLICATE_SUBMISSION' &&
          isDuplicateInquiryMatch(duplicateInquiry)
        ) {
          setDuplicateInquiry(duplicateInquiry)
        }
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

  /** Submit a versioned status change and refresh after success or conflict. */
  async function handleStatusChange(inquiry: Inquiry, status: InquiryStatus) {
    setMessage('')
    setConflictMessage(false)
    setIsSubmitting(true)

    try {
      const result = await apiRequest<{ data: { inquiry: Inquiry } }>(
        `/api/inquiries/${inquiry.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // Send the version displayed in this row so the API can reject stale tabs.
          body: JSON.stringify({
            status,
            expectedVersion: inquiry.version,
          }),
        },
      )

      locallyChangedInquiryIdsRef.current.add(result.data.inquiry.id)
      setExternalInboxChange(false)
      setInquiryListRefresh((current) => current + 1)
      setMessage('Inquiry status updated.')
    } catch (error) {
      if (isApiError(error) && error.code === 'STALE_VERSION') {
        locallyChangedInquiryIdsRef.current.add(inquiry.id)
        setExternalInboxChange(false)
        setInquiryListRefresh((current) => current + 1)
        setConflictMessage(true)
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
        isRateLimited={isSignInRateLimited}
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
                    Review and manage inquiries shared with the support team.
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
                {duplicateInquiry !== null && (
                  <div className="duplicate-notice" role="alert">
                    <span className="conflict-notice-icon" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <h2>Duplicate inquiry — not saved</h2>
                      <p>
                        An inquiry with the same contact and exact subject
                        already exists. Matches are checked across all staff and
                        all dates. This submission was not saved.
                      </p>
                      <p>
                        Existing record: #
                        {duplicateInquiry.id.slice(0, 6).toUpperCase()} —{' '}
                        {inquiryStatusLabels[duplicateInquiry.status]}, created
                        by {duplicateInquiry.createdByEmail} on{' '}
                        {new Date(duplicateInquiry.createdAt).toLocaleString()}.
                      </p>
                      <Link
                        className="duplicate-review-link"
                        to={`/inquiries/${duplicateInquiry.id}`}
                      >
                        Review existing inquiry
                      </Link>
                    </div>
                    <button
                      className="notice-dismiss"
                      type="button"
                      aria-label="Dismiss possible duplicate warning"
                      onClick={() => setDuplicateInquiry(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {externalInboxChange && (
                  <div className="inbox-change-notice" role="status">
                    <p>
                      The team inbox changed. New or updated inquiries are now
                      shown.
                    </p>
                    <button
                      className="notice-dismiss"
                      type="button"
                      aria-label="Dismiss inbox update notice"
                      onClick={() => setExternalInboxChange(false)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {backgroundRefreshError !== '' && (
                  <div className="background-refresh-error" role="alert">
                    <p>
                      Could not check for new inbox updates:{' '}
                      {backgroundRefreshError}
                    </p>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() =>
                        setInquiryListRetry((current) => current + 1)
                      }
                    >
                      Try again
                    </button>
                  </div>
                )}
                {conflictMessage && (
                  <div className="conflict-notice" role="alert">
                    <span className="conflict-notice-icon" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <h2>This inquiry was updated elsewhere</h2>
                      <p>
                        We refreshed the list with the latest status. Review it
                        before making another change.
                      </p>
                    </div>
                  </div>
                )}
                <div className="panel-heading list-heading">
                  <div>
                    <h2 id="list-title">Team inquiries</h2>
                    <p>Shared with all signed-in staff.</p>
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
                  <label className="status-filter" htmlFor="creator-filter">
                    <span>Created by</span>
                    <select
                      id="creator-filter"
                      value={creatorFilter}
                      onChange={(event) => {
                        const selectedCreator = event.target.value
                        if (
                          selectedCreator === 'ALL' ||
                          selectedCreator === 'MINE'
                        ) {
                          setCreatorFilter(selectedCreator)
                          setPage(1)
                        }
                      }}
                    >
                      <option value="ALL">All staff</option>
                      <option value="MINE">Me</option>
                    </select>
                  </label>
                  {(search !== '' ||
                    statusFilter !== 'ALL' ||
                    creatorFilter !== 'ALL') && (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setSearchInput('')
                        setSearch('')
                        setStatusFilter('ALL')
                        setCreatorFilter('ALL')
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
                  hasActiveFilters={
                    search !== '' ||
                    statusFilter !== 'ALL' ||
                    creatorFilter !== 'ALL'
                  }
                  onCreateInquiry={() => setIsCreateFormOpen(true)}
                  onClearFilters={() => {
                    setSearchInput('')
                    setSearch('')
                    setStatusFilter('ALL')
                    setCreatorFilter('ALL')
                    setPage(1)
                  }}
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
