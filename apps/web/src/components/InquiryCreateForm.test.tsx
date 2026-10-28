import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InquiryCreateForm } from './InquiryCreateForm.js'

describe('InquiryCreateForm', () => {
  // Clear mounted components after each form interaction test.
  afterEach(() => {
    cleanup()
  })

  // Invalid required fields show individual errors and block submission.
  it('shows field-specific validation errors and does not submit invalid values', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()

    render(
      <InquiryCreateForm
        isSubmitting={false}
        onSuccess={vi.fn()}
        onSubmit={onSubmit}
        onInvalid={onInvalid}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save inquiry' }))

    expect(await screen.findAllByText('This field is required.')).toHaveLength(
      4,
    )
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledOnce()
  })

  it('requires phone contacts to contain exactly 10 digits', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()

    render(
      <InquiryCreateForm
        isSubmitting={false}
        onSuccess={vi.fn()}
        onSubmit={onSubmit}
        onInvalid={onInvalid}
      />,
    )

    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: 'Taylor Customer' },
    })
    fireEvent.change(screen.getByLabelText('Contact (email or phone)'), {
      target: { value: '123456789' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Order question' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Please check my order.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save inquiry' }))

    expect(
      await screen.findByText(
        'Enter a valid email address or a phone number with 10 digits.',
      ),
    ).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledOnce()
  })

  // Trim whitespace before passing valid values to the save callback.
  it('submits trimmed validated values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <InquiryCreateForm
        isSubmitting={false}
        onSuccess={vi.fn()}
        onSubmit={onSubmit}
        onInvalid={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: '  Taylor Customer  ' },
    })
    fireEvent.change(screen.getByLabelText('Contact (email or phone)'), {
      target: { value: ' taylor@example.com ' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: '  Order question  ' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '  Please check my order.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save inquiry' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      customerName: 'Taylor Customer',
      contact: 'taylor@example.com',
      subject: 'Order question',
      description: 'Please check my order.',
    })
  })

  // Preserve all entered information when the parent reports a save failure.
  it('keeps entered values when submission fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(
      <InquiryCreateForm
        isSubmitting={false}
        onSuccess={vi.fn()}
        onSubmit={onSubmit}
        onInvalid={vi.fn()}
      />,
    )

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

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(screen.getByLabelText('Customer name')).toHaveProperty(
      'value',
      'Taylor Customer',
    )
  })

  // Clear the form only after the parent confirms the save succeeded.
  it('clears entered values after successful submission', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <InquiryCreateForm
        isSubmitting={false}
        onSuccess={vi.fn()}
        onSubmit={onSubmit}
        onInvalid={vi.fn()}
      />,
    )

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

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
      expect(screen.getByLabelText('Customer name')).toHaveProperty('value', '')
    })
  })
})
