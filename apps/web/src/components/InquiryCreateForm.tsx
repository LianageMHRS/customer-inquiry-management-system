import { useForm, type UseFormSetError } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { INQUIRY_FIELD_LIMITS } from '@customer-inquiry/shared/inquiry'
import {
  inquiryFormSchema,
  type InquiryFormValues,
} from '../schemas/inquiry.schema.js'

type InquiryCreateFormProps = {
  isSubmitting: boolean
  onSuccess: () => void
  onSubmit: (
    values: InquiryFormValues,
    setFieldError: UseFormSetError<InquiryFormValues>,
  ) => Promise<boolean>
  onInvalid: () => void
}

const defaultValues: InquiryFormValues = {
  customerName: '',
  contact: '',
  subject: '',
  description: '',
}

/** Render the inquiry form and preserve entered values when saving fails. */
export function InquiryCreateForm({
  isSubmitting,
  onSuccess,
  onSubmit,
  onInvalid,
}: InquiryCreateFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  /** Reset the form only after the parent confirms the API save succeeded. */
  async function submit(values: InquiryFormValues) {
    const succeeded = await onSubmit(values, setError)
    if (succeeded) {
      reset()
      onSuccess()
    }
  }

  return (
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
        onSubmit={handleSubmit(submit, onInvalid)}
        noValidate
      >
        <div className="form-field">
          <label htmlFor="customer-name">Customer name</label>
          <input
            id="customer-name"
            {...register('customerName')}
            maxLength={INQUIRY_FIELD_LIMITS.customerName}
            aria-invalid={errors.customerName !== undefined}
            aria-describedby={
              errors.customerName !== undefined
                ? 'customer-name-error'
                : 'customer-name-hint'
            }
          />
          {errors.customerName ? (
            <span className="field-error" id="customer-name-error">
              {errors.customerName.message}
            </span>
          ) : (
            <span className="field-hint" id="customer-name-hint">
              Up to {INQUIRY_FIELD_LIMITS.customerName} characters.
            </span>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="contact">Contact (email or phone)</label>
          <input
            id="contact"
            {...register('contact')}
            maxLength={INQUIRY_FIELD_LIMITS.contact}
            aria-invalid={errors.contact !== undefined}
            aria-describedby={
              errors.contact !== undefined ? 'contact-error' : 'contact-hint'
            }
          />
          {errors.contact ? (
            <span className="field-error" id="contact-error">
              {errors.contact.message}
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
            {...register('subject')}
            maxLength={INQUIRY_FIELD_LIMITS.subject}
            aria-invalid={errors.subject !== undefined}
            aria-describedby={
              errors.subject !== undefined ? 'subject-error' : 'subject-hint'
            }
          />
          {errors.subject ? (
            <span className="field-error" id="subject-error">
              {errors.subject.message}
            </span>
          ) : (
            <span className="field-hint" id="subject-hint">
              Up to {INQUIRY_FIELD_LIMITS.subject} characters.
            </span>
          )}
        </div>
        <div className="form-field form-field-wide">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            {...register('description')}
            maxLength={INQUIRY_FIELD_LIMITS.description}
            rows={3}
            aria-invalid={errors.description !== undefined}
            aria-describedby={
              errors.description !== undefined
                ? 'description-error'
                : 'description-hint'
            }
          />
          {errors.description ? (
            <span className="field-error" id="description-error">
              {errors.description.message}
            </span>
          ) : (
            <span className="field-hint" id="description-hint">
              Up to {INQUIRY_FIELD_LIMITS.description} characters.
            </span>
          )}
        </div>
        <div className="form-actions form-field-wide">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save inquiry'}
          </button>
        </div>
      </form>
    </section>
  )
}
