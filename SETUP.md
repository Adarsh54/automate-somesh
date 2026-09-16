# Cuebook accounts and projects

## Services and secrets

The production Vercel project is `automate-somesh`. Configure these **server-only** environment variables for Production (never prefix secrets with VITE_):

- `APP_URL=https://automate-somesh.vercel.app`
- `WORKOS_API_KEY`: production WorkOS environment API key
- `WORKOS_CLIENT_ID`: client ID from the same WorkOS environment
- `SESSION_SECRET`: random secret of at least 32 characters; generate with `openssl rand -base64 48`
- `DATABASE_URL`: Neon PostgreSQL connection string with TLS
- `BLOB_READ_WRITE_TOKEN`: server-only token for the private `cuebook-media` Vercel Blob store
- `BLOB_STORE_ID`: store ID, added by the Vercel store connection

WorkOS AuthKit redirect URI:
`https://automate-somesh.vercel.app/api/auth?action=callback`

Enable hosted email login/signup and email verification in WorkOS. Social login can be added later. Configure the production application name as Cuebook. WorkOS may require billing information before activating its production environment.

Use a separate WorkOS staging environment and Neon branch for development/preview. Do not expose production credentials to untrusted preview branches. For localhost use `APP_URL=http://localhost:5173` and add `http://localhost:5173/api/auth?action=callback` to the staging redirect allowlist.

## Database

Create a Neon database in a region near the Vercel Functions region. Keep `DATABASE_URL` in a gitignored `.env.local` for migration, then run:

```sh
npm run db:migrate
```

The idempotent migrations in `migrations/` create user profiles, private projects, and media ownership records. A project's JSON document preserves cue overrides, common credits, timing metadata and detection settings; media bytes go to private Vercel Blob, never Postgres. Query helpers use bound SQL parameters and require user ownership. Revision checks reject conflicting saves with HTTP 409.

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

The editor saves drafts locally under a per-user key. **Save project** explicitly sends a snapshot to Neon; there is no automatic cloud save yet. **Save a copy** resolves a conflict without overwriting the other version. **Import browser project** explicitly copies the old anonymous workspace into the signed-in account and keeps the original. Saved media loads automatically after reloading or switching projects. Older projects need one reattachment and save to upload their media. Signing out revokes the session but retains the per-user local draft on this device.

## Checks

`npm test` includes OAuth state/cookie/refresh checks, origin enforcement, request validation, and real PostgreSQL ownership/revision tests via PGlite.

`scripts/browser-cloud-check.cjs` tests the UI with mocked identity/project responses (not a live WorkOS login). Before declaring setup complete, verify a real hosted sign-in, project save/reload, logout and a second-account ownership check against Neon.

## Private audio/video storage

The `cuebook-media` private Blob store (IAD1) is connected to Vercel. Save project uploads attached original files directly from the browser using multipart uploads, then saves their asset IDs in Neon. The server issues upload tokens only to the authenticated owner, restricted to an exact generated path, content type, declared size and one-hour expiration, without overwrite. Finalization checks Blob metadata before allowing a project reference. Project copies reuse immutable assets.

Downloads require an owner check and return a GET-only signed URL scoped to one object, expiring after five minutes. URLs and credentials are never saved in the project document. Downloads go directly to Blob; media decoding stays in the browser. Restore media retries failed downloads without changing cue review flags or movie timing overrides.

- `POST /api/media?action=reserve`: validate metadata and create an owned pending asset.
- `POST /api/media`: issue a constrained client upload token.
- `POST /api/media?action=complete`: verify the uploaded object's size/path/type and mark ready.
- `GET /api/media?id=UUID`: authorize and return a short-lived private download URL.

Per-file application limit: 2 GiB; actual capacity depends on the Vercel plan (the current Hobby store shows 1 GB included storage and 10 GB transfer). The existing browser decoder duration limit still applies. Failed saves retain the local draft; completed uploads are reused on retry. Removing a file from a project removes its reference, not the stored object, so other saved copies remain intact. Orphan cleanup and a permanent-delete UI are not yet implemented; manage unneeded objects in the private Blob dashboard. An interrupted upload before finalization may leave an unused object/reservation.

`scripts/browser-media-check.cjs` tests audio/video save, upload failure, reload/decoding and copy reuse with a mock Blob transport against the Vite dev server. `npm test` also tests real Postgres media ownership and signed-download authorization. A real production login/upload/download round trip is required before calling the hosted integration fully verified.
