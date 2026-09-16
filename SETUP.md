# Cuebook accounts and projects

## Services and secrets

The production Vercel project is `automate-somesh`. Configure these **server-only** environment variables for Production (never prefix secrets with VITE_):

- `APP_URL=https://automate-somesh.vercel.app`
- `WORKOS_API_KEY`: production WorkOS environment API key
- `WORKOS_CLIENT_ID`: client ID from the same WorkOS environment
- `SESSION_SECRET`: random secret of at least 32 characters; generate with `openssl rand -base64 48`
- `DATABASE_URL`: Neon PostgreSQL connection string with TLS

WorkOS AuthKit redirect URI:
`https://automate-somesh.vercel.app/api/auth?action=callback`

Enable hosted email login/signup and email verification in WorkOS. Social login can be added later. Configure the production application name as Cuebook. WorkOS may require billing information before activating its production environment.

Use a separate WorkOS staging environment and Neon branch for development/preview. Do not expose production credentials to untrusted preview branches. For localhost use `APP_URL=http://localhost:5173` and add `http://localhost:5173/api/auth?action=callback` to the staging redirect allowlist.

## Database

Create a Neon database in a region near the Vercel Functions region. Keep `DATABASE_URL` in a gitignored `.env.local` for migration, then run:

```sh
npm run db:migrate
```

The idempotent migration is checked in at `migrations/001_users_projects.sql`. It creates user profiles and private projects. A project's JSON document preserves cue overrides, common credits, timing metadata and detection settings; media bytes are not uploaded. Query helpers use bound SQL parameters and require user ownership. Revision checks reject conflicting saves with HTTP 409.

Redeploy after setting Vercel environment variables.

## Local development

```sh
npm run dev:api
VITE_API_ENABLED=true npm run dev
```

If service credentials are missing, accounts remain disabled and the existing browser-only workspace still works. No fake login or fallback user is used.

## Account behavior

- `GET /api/auth?action=login`: redirect to WorkOS, PKCE verifier and state in an encrypted, short-lived HTTP-only cookie.
- `GET /api/auth?action=callback`: validate state, exchange code, upsert Neon user profile, set encrypted session cookie.
- `GET /api/auth?action=me`: return only the current user's ID/email/name, never tokens.
- `POST /api/auth?action=logout`: require matching Origin, revoke WorkOS session, clear cookie.
- `GET /api/projects`: list the current user's latest 100 projects.
- `GET /api/projects?id=UUID`: load one owned project.
- `POST /api/projects`: create with revision 0 or save with the current revision; require matching Origin and an authenticated session.

Sessions use Secure cookies in production, HttpOnly, SameSite=Lax and SDK validation/refresh. Both ownership and revision are checked in each update. No client-supplied user ID is trusted.

The editor saves drafts locally under a per-user key. **Save project** explicitly sends a snapshot to Neon; there is no automatic cloud save yet. **Save a copy** resolves a conflict without overwriting the other version. **Import browser project** explicitly copies the old anonymous workspace into the signed-in account and keeps the original. Media must be reattached after reloading or switching projects. Signing out revokes the session but retains the per-user local draft on this device.

## Checks

`npm test` includes OAuth state/cookie/refresh checks, origin enforcement, request validation, and real PostgreSQL ownership/revision tests via PGlite.

`scripts/browser-cloud-check.cjs` tests the UI with mocked identity/project responses (not a live WorkOS login). Before declaring setup complete, verify a real hosted sign-in, project save/reload, logout and a second-account ownership check against Neon.
