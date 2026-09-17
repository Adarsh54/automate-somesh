# Local development

Cuestamp uses a Vite frontend and a small Node API that runs the same handlers as Vercel Functions. **Start both processes to test login and account features.** A frontend-only preview does not provide working authentication.

## Quick start on an already configured machine

Use Node.js 24 (the version used for local verification) and npm. From the repository root:

```sh
npm ci
```

Start the API in one terminal:

```sh
npm run dev:api
```

Start the frontend in another:

```sh
VITE_API_ENABLED=true npm run dev -- --port 5190 --strictPort
```

Open **http://127.0.0.1:5190/**. Vite proxies `/api` to **http://127.0.0.1:3001**. Keep the host and port exact: `localhost` and `127.0.0.1` are different cookie origins. `--strictPort` prevents Vite from silently moving to a port that WorkOS does not recognize.

## First-time configuration

Create `.env.local` in the repository root. This file is ignored by Git. The values below are placeholders; get credentials from the development services, never from the production environment.

```dotenv
APP_URL=http://127.0.0.1:5190
VITE_API_ENABLED=true
WORKOS_CLIENT_ID=<staging-client-id>
WORKOS_API_KEY=<staging-api-key>
SESSION_SECRET=<random-secret-at-least-32-characters>
DATABASE_URL=<neon-development-connection-string-with-TLS>
```

Generate a session secret with `openssl rand -base64 48` and save it as `SESSION_SECRET`. Keep it stable between restarts; changing it invalidates existing local sessions. Never commit credentials or prefix server secrets with `VITE_`, which exposes values to frontend code. The API startup command reads `.env.local`; Vite also reads it. Restart both processes after changing configuration.

### WorkOS

1. Select **Staging** in the Cuestamp WorkOS project.
2. Copy the staging application client ID and API key into `.env.local`.
3. Under the application's **Redirects**, allow this exact URI:
   `http://127.0.0.1:5190/api/auth?action=callback`
4. Ensure the authentication methods you want to test are enabled. Email/password is enabled in the existing staging environment.

Existing staging environment: `environment_01M2MF0JB2D5ME8DH5MKMRKWSZ`.

Staging users and sessions are separate from production. A production account does not automatically exist locally. Complete signup or a staging social-login flow when testing for the first time. Start each test from the app's Log in or Sign up button rather than reusing an old AuthKit URL; authorization state expires.

### Neon

Use the **local-development** branch of the **cuestamp** Neon project:

- Project: `damp-forest-37558489`
- Branch: `br-withered-violet-a5u6xm3o`

This branch was created from the production schema without production rows. Copy its connection string using the branch's Connect dialog and put it in `DATABASE_URL`. Keep the TLS parameters in the connection string.

For a new branch, or after pulling new migrations:

```sh
npm run db:migrate
```

Check the connection targets the development branch before migrating. Login also requires a working database because the callback creates or updates the user's profile.

### Media storage is a separate setup step

This machine has staging login, the development database, and the private **cuestamp-media-development** Blob store configured. The store is connected only to the Vercel Development environment.

- Small-file browser processing and manual cue editing work without Blob storage.
- Saving uploaded media to an account and processing files over 100 MB require the development store’s server-side `BLOB_READ_WRITE_TOKEN` in `.env.local`. Restart the API after adding or changing it.
- Matching against a large file also uploads its reference files.
- On another machine, pull the Vercel Development environment into a temporary file and copy its `BLOB_READ_WRITE_TOKEN` into `.env.local`, preserving your local WorkOS and Neon settings. Never print or commit that token. Do not reuse the production Blob token.

From a checkout linked to the Cuestamp Vercel project, download the development settings to an ignored file:

```sh
npx vercel env pull .env.blob-development.local --environment development
chmod 600 .env.blob-development.local
```

Copy only `BLOB_READ_WRITE_TOKEN` from that file into `.env.local`, then delete the temporary file. Stop and restart `npm run dev:api` to load the credential. Keep the existing local WorkOS, Neon, and `APP_URL` values intact.

Saving a project uploads its attached audio/video before saving the project record in Neon. Working login and database access alone are therefore not enough to save a project with media. If saving reports **“Blob failed to retrieve token”**, check that the development Blob token is present and that the API was restarted, then retry **Save project**. The failed save keeps the local draft. If it still fails, inspect the `/api/media` token request in the browser’s Network panel; an expired login or another API error can also prevent token retrieval.

See [SETUP.md](SETUP.md) for media storage, cleanup, processing limits, and production configuration.

## Verify the local connection

With both processes running:

```sh
curl -s http://127.0.0.1:5190/api/health
curl -s 'http://127.0.0.1:5190/api/auth?action=me'
```

The auth response should be `{"configured":true,"user":null}` before login. `configured: true` means the required settings are present; it is not proof that a full sign-in succeeded. Click Log in or Sign up, complete WorkOS authentication, and confirm you return to the local app with account controls and Log out.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Account buttons disabled or access unavailable | `VITE_API_ENABLED=true`, all required `.env.local` values, and the API process on port 3001. |
| Auth endpoint returns `configured: false` | WorkOS key/client ID, `APP_URL`, `DATABASE_URL`, and a session secret of at least 32 characters must all be present. |
| `/api` requests fail or Vite reports a proxy error | Start `npm run dev:api`; Vite alone cannot serve the API. |
| WorkOS rejects the redirect | Match the callback allowlist to `http://127.0.0.1:5190/api/auth?action=callback` exactly. |
| Return to the app with `authError=1` | Start a fresh login flow; check matching staging credentials, stable session secret, correct cookie host, and database connectivity/migrations. |
| Port already in use | Reuse or stop the existing development process. Do not change the frontend port without also updating `APP_URL` and WorkOS's callback. |
| Login works but saving reports “Blob failed to retrieve token” | Add the development store’s `BLOB_READ_WRITE_TOKEN` to `.env.local`, restart the API, and retry Save project. See the media-storage setup above. If it persists, inspect the `/api/media` response. |

## Checks before submitting code

```sh
npm test
npm run build
```

For changes to media processing or workflow interactions, the existing `scripts/browser-check.cjs` exercises real Wasm analysis and export. Its setup is documented in the script and [SETUP.md](SETUP.md).

Local credentials remain machine-specific. A fresh checkout or another developer's machine needs its own `.env.local`; pulling this repository does not configure services automatically.

### Deployment dependency integrity errors

Vercel runs `npm ci`, then `npm run db:migrate && npm test && VITE_API_ENABLED=true npm run build`. Database migrations must remain idempotent and compatible with the currently deployed version; failed migrations block deployment. An `EINTEGRITY` failure happens before the app builds. Compare the affected lockfile entry with `npm view <package>@<version> dist.integrity` and verify a clean install with a fresh cache; do not disable integrity checks.

The failed deployment of `a6498a8` had an incorrect `picomatch@4.0.7` checksum. The corrected lockfile uses npm’s published `sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`. Preserve the regenerated lockfile when incorporating the upstream credit-profile changes; do not restore that commit’s incorrect checksum during conflict resolution.

### User profiles

Run `npm run db:migrate` after pulling the profile feature (`004_user_profiles.sql`). WorkOS handles login; Neon stores the editable display name and occupation. Signed-in users with incomplete profiles see a setup form, and Profile in the account dropdown reopens it. Vercel applies migrations to its configured database during the build, before publishing the profile-enabled API. Local migration commands only update the configured development database.
