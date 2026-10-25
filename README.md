# Customer Inquiry Management System

A staff tool for recording customer inquiries, finding them later, and moving
them through New, In Progress, and Resolved.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL

## Run locally

1. Install dependencies from the repository root:

   ```powershell
   npm.cmd install
   ```

2. Copy `apps/api/.env.example` to `apps/api/.env` and
   `apps/web/.env.example` to `apps/web/.env`.
3. In `apps/api/.env`, set the PostgreSQL connection URLs and a
   `SESSION_SECRET` of at least 64 characters. Create the development database
   (`customer_inquiry`) and test database (`customer_inquiry_test`) in your
   local PostgreSQL server. The migration connection must be allowed to apply
   schema changes; the application connection needs access to the app's data
   and session tables.
4. Apply the database schema:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:migrate:test
   ```

5. Create a staff account from the repository folder. The command asks for the
   password twice without displaying it:

   ```powershell
   npm.cmd run user:create -- staff@example.com
   ```

   Run the same command again with a different email for every additional
   staff member. There is no sign-up page and no fixed limit on accounts.
   Passwords are hashed before they are saved, and `.env` is used only for
   application and database configuration—not for a list of staff passwords.

6. Start the API and website:

   ```powershell
   npm.cmd run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) and sign in with the
   staff account you created. The API runs at
   [http://localhost:3000](http://localhost:3000).

## Tests

Run both test suites from the repository root:

```powershell
npm.cmd run test:backend
npm.cmd run test:frontend
```

The backend tests use the separate local test database. Do not point test
database settings at data you need to keep.
