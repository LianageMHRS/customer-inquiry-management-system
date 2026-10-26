# My project decisions

## How I approached the project

I treated this as a small tool for staff to record customer questions, find
them later, and keep track of what has happened. I chose a shared inbox so all
signed-in staff can coordinate around the same inquiries. I also assumed that
a resolved inquiry may need to be reopened if the customer gets back in touch.

## Choices I made

1. **Use a shared staff inbox.** Any signed-in staff member can view and update
   inquiries. The API requires a valid session; it does not rely on the page
   simply hiding data. The creator is still recorded for attribution, and a
   **Created by: Me** filter lets each person focus on inquiries they entered.
   The list and detail page show the creator's staff email, and the visible
   inbox checks for changes every 30 seconds. The API derives the current
   person from the verified session rather than trusting a user ID from the
   browser.
2. **Keep the status steps simple.** An inquiry starts as **New**, moves to
   **In Progress**, and can then be marked **Resolved**. A resolved inquiry
   can be reopened and moved back to **In Progress**. The system checks the
   information when it is submitted. Any inquiry with the same contact and
   exact subject is blocked across all staff, regardless of when the earlier
   inquiry was created. The app explains that it was not saved and links to
   the existing inquiry with its creator and status.
3. **Protect updates made from old browser tabs or another staff member.**
   If someone changes an inquiry, another person may still see old
   information. The system checks the version and asks them to review the
   latest status instead of quietly replacing the newer update.

I used React for the website, Express for the API, and PostgreSQL to store
staff accounts, inquiries, and sign-in sessions. Keeping the website, API,
and database work separate makes it easier to find where each part of the
system is handled.

## A trade-off I accepted

Checking for old information and duplicate inquiries adds extra work to the
system. I chose these checks because they help prevent confusing status
changes and repeated inquiries. The permanent contact-and-subject rule may
also block a genuinely new later request that reuses the same subject. For
now, stale
protection applies to status changes only; the app checks the shared inbox
every 30 seconds while the browser tab is visible, rather than using a live
push connection, and it does not keep a full history of every edit. A
background refresh may show the latest status before someone attempts a
change, but the API still rejects any update that arrives with an old version
and the app displays the stale-update alert.

## Tests and what I would improve

The tests check that invalid information is rejected, signed-in staff can
share inquiries, duplicates across staff and all dates are rejected without
being saved (including a test inquiry aged by two days), creators are shown,
the status steps work correctly, and a different staff member's old view
cannot overwrite a newer status. They also check the
created-by filter, periodic inbox refresh and its error handling, and reject
attempts to supply an arbitrary creator value. The website tests use sample
responses, though, so they do not automatically test the whole website
connected to the database. I have also not tested the system with many
requests arriving at once or with several people editing inquiry details
simultaneously.

If I continue developing the application, I would consider the following improvements:
Add inquiry change history: Record important status changes, including the previous status, new status, staff member, and timestamp. This would help staff understand how an inquiry has progressed.

Consider inquiry editing: Allow staff to correct customer or inquiry details if the business requires this functionality. Any editing feature should include appropriate validation, signed-in access checks, and stale-data protection.

Consider inquiry deletion or archiving: If required by the business, introduce an appropriately authorized way to remove or archive inquiries. Archiving may be preferable when retaining customer-service records is important.

## Use of AI

I used AI to help explore ideas and work on code, tests, and documentation.
For example, I used the suggestion to check whether an inquiry had changed
before accepting a status update. When testing showed that the warning about
an old tab was easy to miss, I changed where it appeared so it would be more
visible. I should be able to explain the choices in this document and the
parts of the project I submit.
