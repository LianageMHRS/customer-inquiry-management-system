# Customer Inquiry Management System

A staff-only inquiry tracker built in phases for the Coffee Ninja full-stack
assessment. The React app and Express API are separate npm workspaces. PostgreSQL
will be introduced in the database phase; this setup phase starts with an API
health endpoint so the two development servers can be checked independently.

## Workspace layout

- `apps/web`: React, TypeScript, and Vite browser application.
- `apps/api`: Express API and its TypeScript configuration.
- `scripts`: small cross-platform development helpers.
- `docs`: assessment documentation added as the implementation progresses.

Within the API, routes will connect HTTP requests to controllers, services will
enforce business rules, and repositories will own all SQL. The browser will use
Vite's `/api` proxy in development so requests share the web origin.

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
Copy them to `.env` in their respective app folders when a later phase requires
local configuration. Never paste real secrets into chat or commit `.env` files.
The API currently validates its environment using Zod; database and session
configuration becomes mandatory when those features are implemented.

## Current phase status

Phase 1 establishes the workspace, development servers, strict TypeScript
settings, and baseline lint/format tooling. Database schema, authentication,
inquiry features, and their tests are intentionally not implemented yet.
