import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, isApiError } from '../api/client.js'
import { inquiryStatusLabels, type Inquiry } from '../types/inquiry.js'

/** Load and display one authorized inquiry with retryable request states. */
export function InquiryDetailPage({ inquiryId }: { inquiryId: string }) {
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isNotFound, setIsNotFound] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    // Avoid updating state if a slow request finishes after navigation away.
    let isMounted = true

    async function loadInquiry() {
      setIsLoading(true)
      setErrorMessage('')
      setIsNotFound(false)

      try {
        const result = await apiRequest<{
          data: { inquiry: Inquiry }
        }>(`/api/inquiries/${encodeURIComponent(inquiryId)}`, { method: 'GET' })

        if (isMounted) {
          setInquiry(result.data.inquiry)
        }
      } catch (error) {
        if (isMounted) {
          if (isApiError(error) && error.status === 404) {
            setIsNotFound(true)
          } else {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : 'Could not load this inquiry.',
            )
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadInquiry()

    return () => {
      isMounted = false
    }
  }, [inquiryId, reloadCount])

  return (
    <div className="detail-page">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Inquiries</Link>
        <span aria-hidden="true">/</span>
        <span>Details</span>
      </nav>
      {isLoading ? (
        <section className="panel detail-state-card" aria-live="polite">
          <span className="detail-state-mark" aria-hidden="true">
            …
          </span>
          <h1>Loading inquiry</h1>
          <p role="status">Please wait while we retrieve the details.</p>
        </section>
      ) : isNotFound ? (
        <section className="panel detail-state-card" role="status">
          <span className="detail-state-mark" aria-hidden="true">
            !
          </span>
          <p className="eyebrow">RECORD UNAVAILABLE</p>
          <h1>Inquiry not found</h1>
          <p>
            This inquiry may have been removed or you may not have permission to
            view it.
          </p>
          <Link className="button" to="/">
            <span aria-hidden="true">←</span>
            Back to inquiries
          </Link>
        </section>
      ) : errorMessage !== '' ? (
        <section className="panel detail-state-card" role="alert">
          <span
            className="detail-state-mark detail-state-error"
            aria-hidden="true"
          >
            !
          </span>
          <p className="eyebrow">SOMETHING WENT WRONG</p>
          <h1>We couldn’t load this inquiry</h1>
          <p>{errorMessage}</p>
          <button
            className="button"
            type="button"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            Try again
          </button>
        </section>
      ) : inquiry !== null ? (
        <div className="detail-layout">
          <section className="panel detail-hero" aria-labelledby="detail-title">
            <div className="detail-hero-top">
              <p className="detail-reference">
                <span className="detail-reference-mark" aria-hidden="true">
                  #
                </span>
                INQUIRY {inquiry.id.slice(0, 6).toUpperCase()}
              </p>
              <span
                className={`detail-status status-${inquiry.status.toLowerCase().replace('_', '-')}`}
              >
                <span className="status-dot" aria-hidden="true" />
                {inquiryStatusLabels[inquiry.status]}
              </span>
            </div>
            <h1 id="detail-title">{inquiry.subject}</h1>
            <div className="detail-hero-bottom">
              <p>
                Submitted{' '}
                <time dateTime={inquiry.createdAt}>
                  {new Date(inquiry.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </p>
              <Link className="detail-back-link" to="/">
                <span aria-hidden="true">←</span>
                Back to inquiries
              </Link>
            </div>
          </section>

          <div className="detail-content-grid">
            <section
              className="panel detail-card detail-description-card"
              aria-labelledby="description-title"
            >
              <div className="detail-card-heading">
                <span className="detail-card-icon" aria-hidden="true">
                  ☰
                </span>
                <div>
                  <h2 id="description-title">Inquiry description</h2>
                  <p>Details provided by the customer</p>
                </div>
              </div>
              <p className="detail-description-text">{inquiry.description}</p>
            </section>

            <section
              className="panel detail-card"
              aria-labelledby="customer-title"
            >
              <div className="detail-card-heading">
                <span className="detail-card-icon" aria-hidden="true">
                  {inquiry.customerName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2 id="customer-title">Customer information</h2>
                  <p>Contact details for this inquiry</p>
                </div>
              </div>
              <dl className="detail-information">
                <div>
                  <dt>Customer name</dt>
                  <dd>{inquiry.customerName}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{inquiry.contact}</dd>
                </div>
              </dl>
            </section>

            <section
              className="panel detail-card detail-timeline-card"
              aria-labelledby="timeline-title"
            >
              <div className="detail-card-heading">
                <span className="detail-card-icon" aria-hidden="true">
                  ◷
                </span>
                <div>
                  <h2 id="timeline-title">Record history</h2>
                  <p>When this inquiry was created and updated</p>
                </div>
              </div>
              <dl className="detail-information detail-timeline">
                <div>
                  <dt>Created</dt>
                  <dd>
                    <time dateTime={inquiry.createdAt}>
                      {new Date(inquiry.createdAt).toLocaleString()}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>
                    <time dateTime={inquiry.updatedAt}>
                      {new Date(inquiry.updatedAt).toLocaleString()}
                    </time>
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}
