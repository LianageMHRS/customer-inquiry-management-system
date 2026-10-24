type ValidationIssue = {
  path: readonly PropertyKey[]
  message: string
}

export function toFieldErrors(
  issues: readonly ValidationIssue[],
): Record<string, string[]> {
  return issues.reduce<Record<string, string[]>>((fieldErrors, issue) => {
    const field = issue.path.map(String).join('.') || '_form'
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message]
    return fieldErrors
  }, {})
}
