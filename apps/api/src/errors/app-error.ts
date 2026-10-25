export class AppError extends Error {
  /** Create an expected HTTP error with a stable code and optional details. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
