import { Link } from 'react-router-dom'
import { InquiryStatusControl } from './InquiryStatusControl.js'
import type { Inquiry } from '../types/inquiry.js'

export type InquiryPagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type InquiryResultsProps = {
  inquiries: Inquiry[]
  pagination: InquiryPagination
  page: number
  isLoading: boolean
  isSubmitting: boolean
  errorMessage: string
  hasActiveFilters: boolean
  onCreateInquiry: () => void
  onClearFilters: () => void
  onRetry: () => void
  onPageChange: (page: number) => void
  onStatusChange: (inquiry: Inquiry, status: Inquiry['status']) => void
}

/** Render inquiry rows together with loading, error, empty, and paging states. */
export function InquiryResults({
  inquiries,
  pagination,
  page,
  isLoading,
  isSubmitting,
  errorMessage,
  hasActiveFilters,
  onCreateInquiry,
  onClearFilters,
  onRetry,
  onPageChange,
  onStatusChange,
}: InquiryResultsProps) {
  return (
    <>
      {isLoading ? (
        <p className="table-message" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Loading inquiries...</span>
        </p>
      ) : errorMessage !== '' ? (
        <div className="table-message" role="alert">
          <p>{errorMessage}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : inquiries.length === 0 ? (
        <div className="inquiry-empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M8 20.5h9l3.5 4h7l3.5-4h9v18H8v-18Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M8 20.5 12 10h24l4 10.5M18 31h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {hasActiveFilters ? (
            <>
              <h3>No matching inquiries</h3>
              <p>
                Try changing your search or filters to find the inquiry you’re
                looking for.
              </p>
              <button
                className="button button-secondary"
                type="button"
                onClick={onClearFilters}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h3>No inquiries yet</h3>
              <p>
                When your team adds customer inquiries, they’ll appear here.
                Create the first one to get started.
              </p>
              <button
                className="button"
                type="button"
                onClick={onCreateInquiry}
              >
                Create an inquiry
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="inquiry-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Subject</th>
                <th scope="col">Customer</th>
                <th scope="col">Created</th>
                <th scope="col">Created by</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <td className="inquiry-id">
                    #{inquiry.id.slice(0, 6).toUpperCase()}
                  </td>
                  <td>
                    <span className="table-subject">{inquiry.subject}</span>
                    <span className="table-description">
                      {inquiry.description}
                    </span>
                  </td>
                  <td>
                    <span className="table-customer">
                      {inquiry.customerName}
                    </span>
                    <span className="table-contact">{inquiry.contact}</span>
                  </td>
                  <td className="created-date">
                    {new Date(inquiry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="created-by">{inquiry.createdByEmail}</td>
                  <td>
                    <InquiryStatusControl
                      inquiry={inquiry}
                      disabled={isSubmitting}
                      onStatusChange={onStatusChange}
                    />
                  </td>
                  <td>
                    <Link
                      className="button button-secondary open-inquiry-button"
                      to={`/inquiries/${inquiry.id}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && errorMessage === '' && pagination.totalPages > 1 && (
        <nav className="pagination-controls" aria-label="Inquiry pages">
          <span className="pagination-summary">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)}{' '}
            of {pagination.total}
          </span>
          <div className="pagination-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              className="button button-secondary"
              type="button"
              disabled={page >= pagination.totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </>
  )
}
