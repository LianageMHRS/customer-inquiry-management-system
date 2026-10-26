import type { FormEvent } from 'react'

type SignInPageProps = {
  email: string
  password: string
  message: string
  isRateLimited: boolean
  isSubmitting: boolean
  onEmailChange: (email: string) => void
  onPasswordChange: (password: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

/** Present the staff sign-in form and its accessible feedback message. */
export function SignInPage({
  email,
  password,
  message,
  isRateLimited,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: SignInPageProps) {
  return (
    <main className="auth-card sign-in-card">
      <p className="eyebrow">Customer Inquiry Management</p>
      <section aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">Staff sign in</h1>
        <p className="description">
          Sign in with the staff account created for this project.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
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
            onChange={(event) => onPasswordChange(event.target.value)}
            required
            maxLength={128}
          />
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
      {message !== '' &&
        (isRateLimited ? (
          <div
            className="feedback feedback-rate-limit"
            role="alert"
            aria-live="assertive"
          >
            <span className="feedback-icon" aria-hidden="true">
              !
            </span>
            <div>
              <h2>Sign-in temporarily unavailable</h2>
              <p>{message}</p>
            </div>
          </div>
        ) : (
          <p className="feedback" role="alert" aria-live="assertive">
            {message}
          </p>
        ))}
    </main>
  )
}
