# Customer Inquiry Management System

A staff-only inquiry tracker built in phases for the Coffee Ninja full-stack
assessment. The React app and Express API are separate npm workspaces. PostgreSQL
stores staff accounts, inquiries, and sessions.

## Workspace layout

- `apps/web`: React, TypeScript, and Vite browser application.
- `apps/api`: Express API and its TypeScript configuration.
- `scripts`: small cross-platform development helpers.
- `docs`: assessment documentation added as the implementation progresses.

Within the API, routes will connect HTTP requests to controllers, services will
enforce business rules, and repositories will own application queries. The API
uses `pg` to access PostgreSQL; `node-pg-migrate` applies versioned SQL files so
the same schema can be recreated consistently. The browser uses Vite's `/api`
proxy in development so requests share the web origin.

## Prerequisites

- Node.js 22 LTS or newer LTS release
- npm
- PostgreSQL (needed beginning in the database phase)
- Git

On Windows, use `npm.cmd` if PowerShell blocks the `npm.ps1` shim. This avoids
changing the machine's PowerShell execution policy.

## Setup and run

From the repository root, install dependencies and start both development
servers:

```powershell
npm.cmd install
npm.cmd run dev
```

The web app is served at `http://localhost:5173`; the API is served at
`http://localhost:3000`. The temporary health endpoint is
`http://localhost:3000/api/health`.

To run one app at a time, use `npm.cmd run dev:web` or `npm.cmd run dev:api`.

## Environment files

`apps/api/.env.example` and `apps/web/.env.example` contain placeholders only.
The API example separates the app's database connection from the migration
connection, and includes distinct development and test databases. Copy each
example to `.env` in its respective app folder. Put the passwords you created
in pgAdmin only in `apps/api/.env`; never share them in chat or commit them. If a
password contains URL-reserved characters, percent-encode those characters in
the connection URL.

## Database setup

The `inquiry_migrator` account owns both project databases and is used only to
apply schema changes. The API will use `inquiry_app`, which receives only the
permissions needed for application records and sessions.

The inquiry search indexes use PostgreSQL's `pg_trgm` extension because the
planned substring search uses `ILIKE '%term%'`, which a normal B-tree index
cannot accelerate. The extension is installed by the migration; the database
owner must be allowed to create trusted extensions.

After filling in the local API `.env`, run `npm.cmd run db:migrate` to create
the development schema. Run `npm.cmd run db:migrate:test` to create the test
schema separately. These commands apply the checked-in SQL migration; they do
not erase existing data. Do not run destructive resets against data you need
to keep.

For local development only, configure `SEED_USER_ONE_EMAIL`,
`SEED_USER_ONE_PASSWORD`, `SEED_USER_TWO_EMAIL`, and
`SEED_USER_TWO_PASSWORD` in `apps/api/.env`, then run `npm.cmd run db:seed`.
Passwords must be 12–128 characters. The seed script refuses to run in
production, hashes the passwords with Argon2id, and leaves existing accounts
unchanged on repeated runs.

## Current phase status

Phase 1 established the workspace, development servers, strict TypeScript
settings, and baseline lint/format tooling. Phase 2 is adding the PostgreSQL
schema. Authentication and inquiry workflows will be implemented in later
phases.
