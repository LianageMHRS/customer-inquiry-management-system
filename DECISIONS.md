# My project decisions

## How I approached the project

I treated this as a small tool for staff to record customer questions, find
them later, and keep track of what has happened. I assumed each staff member
should only see the inquiries they created. I also assumed that a resolved
inquiry may need to be reopened if the customer gets back in touch.

## Choices I made

1. **Keep each staff member's inquiries private.** The system checks who is
   signed in before showing or changing an inquiry. It does not rely on the
   page simply hiding information from other staff.
2. **Keep the status steps simple.** An inquiry starts as **New**, moves to
   **In Progress**, and can then be marked **Resolved**. A resolved inquiry
   can be reopened and moved back to **In Progress**. The system checks the
   information when it is submitted, and warns staff about a possible
   duplicate.
3. **Protect updates made from old browser tabs.** If one tab changes an
   inquiry, another tab may still show the old information. The system checks
   for this and asks the staff member to review the latest status instead of
   quietly replacing someone else's update.

I used React for the website, Express for the API, and PostgreSQL to store
staff accounts, inquiries, and sign-in sessions. Keeping the website, API,
and database work separate makes it easier to find where each part of the
system is handled.

## A trade-off I accepted

Checking for old information and possible duplicate inquiries adds extra
work to the system. I chose to include those checks because they help prevent
confusing status changes and accidental repeat submissions. For now, the
old-tab protection applies to status changes only; the app does not update
live or keep a full history of every edit.

## Tests and what I would improve

The tests check that invalid information is rejected, staff cannot see one
another's inquiries, the status steps work correctly, and an old browser tab
cannot overwrite a newer status. The website tests use sample responses,
though, so they do not automatically test the whole website connected to the
database. I have also not tested the system with many requests arriving at
once or with several people editing inquiry details simultaneously.

If I continue the project, If I continue developing the application, I would consider the following improvements:
Add inquiry change history: Record important status changes, including the previous status, new status, staff member, and timestamp. This would help staff understand how an inquiry has progressed.

Consider inquiry editing: Allow staff to correct customer or inquiry details if the business requires this functionality. Any editing feature should include appropriate validation, ownership checks, and stale-data protection.

Consider inquiry deletion or archiving: If required by the business, introduce an appropriately authorized way to remove or archive inquiries. Archiving may be preferable when retaining customer-service records is important.

## Use of AI

I used AI to help explore ideas and work on code, tests, and documentation.
For example, I used the suggestion to check whether an inquiry had changed
before accepting a status update. When testing showed that the warning about
an old tab was easy to miss, I changed where it appeared so it would be more
visible. I should be able to explain the choices in this document and the
parts of the project I submit.
