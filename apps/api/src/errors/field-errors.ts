type ValidationIssue = {
  path: readonly PropertyKey[]
  message: string
}

/** Group validation issues by field for the API's consistent error response. */
export function toFieldErrors(
  issues: readonly ValidationIssue[],
): Record<string, string[]> {
  // Preserve multiple messages and use _form for object-level validation issues.
  return issues.reduce<Record<string, string[]>>((fieldErrors, issue) => {
    const field = issue.path.map(String).join('.') || '_form'
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message]
    return fieldErrors
  }, {})
}
