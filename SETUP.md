# Cuestamp accounts and projects

## Services and secrets

The production Vercel project is `cuestamp`. Configure these **server-only** environment variables for Production (never prefix secrets with VITE_):

- `APP_URL=https://cuestamp.com`
- `WORKOS_API_KEY`: production WorkOS environment API key
- `WORKOS_CLIENT_ID`: client ID from the same WorkOS environment
- `SESSION_SECRET`: random secret of at least 32 characters; generate with `openssl rand -base64 48`
- `DATABASE_URL`: Neon PostgreSQL connection string with TLS
- `BLOB_READ_WRITE_TOKEN`: server-only token for the private `cuestamp-media` Vercel Blob store
- `BLOB_STORE_ID`: store ID, added by the Vercel store connection
- `CRON_SECRET`: random secret of at least 32 characters for authenticated analysis cleanup

WorkOS AuthKit redirect URI:
`https://cuestamp.com/api/auth?action=callback`

Enable hosted email login/signup and email verification in WorkOS. Google login is enabled in the production WorkOS environment. Configure the production application name as Cuestamp. WorkOS may require billing information before activating its production environment.

### Google sign-in

WorkOS hosted AuthKit displays **Continue with Google** on its login/signup forms; no separate frontend OAuth flow or Google secret in Vercel is needed.

- Google Cloud project: `Cuestamp` (`cultivated-link-508820-i9`).
- OAuth client: `Cuestamp WorkOS`, type Web application. Client credentials are stored in the WorkOS Google provider configuration, never in this repository.
- Google authorized redirect URI: `https://auth.workos.com/sso/oauth/google/m5AZrm2RHsjLXphO5hmbGA3Cz/callback`. This is distinct from the app's WorkOS callback above.
- Access is limited to `userinfo.email` and `userinfo.profile`. No Gmail mailbox scopes are requested, and WorkOS's Return Google OAuth tokens option is off.
- Google audience is External. Its publishing status currently remains Testing: Google disables Publish app pending completion of branding. For these basic identity scopes, Google's [documented exception](https://support.google.com/cloud/answer/15549945?hl=en) permits users outside the test-user list, without a testing warning or seven-day authorization expiry. Revisit publishing/verification before adding any other scope.
- Verified on September 16, 2026: the live AuthKit Google button, Google account selection and consent, successful callback to Cuestamp, and signed-in account/Log out controls. No test users were added to Google's allowlist.

Google currently labels the consent destination `workos.com`, matching the shared WorkOS callback domain. Custom consent branding/domain verification is a separate follow-up.

Use a separate WorkOS staging environment and Neon branch for development/preview. Do not expose production credentials to untrusted preview branches. For localhost use `APP_URL=http://127.0.0.1:5190` and add `http://127.0.0.1:5190/api/auth?action=callback` to the staging redirect allowlist.

## Database

Create a Neon database in a region near the Vercel Functions region. Keep `DATABASE_URL` in a gitignored `.env.local` for migration, then run:

```sh
npm run db:migrate
```

The idempotent migrations in `migrations/` create user profiles, private projects, and media ownership records. A project's JSON document preserves cue overrides, common credits, timing metadata and detection settings; media bytes go to private Vercel Blob, never Postgres. Query helpers use bound SQL parameters and require user ownership. Revision checks reject conflicting saves with HTTP 409.

Redeploy after setting Vercel environment variables.

## Local development

Local authentication uses WorkOS **Staging** (`environment_01M2MF0JB2D5ME8DH5MKMRKWSZ`) and the Neon **local-development** branch (`br-withered-violet-a5u6xm3o`). This branch was created from the production schema without production rows. Its migrations are applied. The staging callback is `http://127.0.0.1:5190/api/auth?action=callback`.

Keep `APP_URL`, `VITE_API_ENABLED=true`, `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `SESSION_SECRET`, and `DATABASE_URL` in the gitignored `.env.local`; server secrets must never have a `VITE_` prefix. This machine has these configured. Use the exact host and port below; localhost and 127.0.0.1 are different cookie origins. Staging accounts are separate from production accounts.

Run the API and frontend in separate terminals:

```sh
npm run dev:api
VITE_API_ENABLED=true npm run dev -- --port 5190 --strictPort
```

Local media storage uses the private `cuestamp-media-development` Blob store, connected only to the Vercel Development environment. Its server-side token is in the ignored `.env.local`; see CODEX.md for setup on another machine.

If service credentials are missing, accounts and large-file processing are unavailable; small-file browser processing and manual editing remain usable. No fake login or fallback user is used.

## Account behavior

- `GET /api/auth?action=login`: open the WorkOS login page, with PKCE verifier and state in an encrypted, short-lived HTTP-only cookie.
- `GET /api/auth?action=signup`: open the WorkOS signup page with the same protected callback flow.
- `GET /api/auth?action=callback`: validate state, exchange code, upsert Neon user profile, set encrypted session cookie.
- `GET /api/auth?action=me`: return only the current user's ID/email/name, never tokens.
- `POST /api/auth?action=logout`: require matching Origin, revoke WorkOS session, clear cookie.
- `GET /api/projects`: list the current user's projects with creation and update timestamps.
- `GET /api/projects?id=UUID`: load one owned project.
- `POST /api/projects`: create with revision 0 or save with the current revision; require matching Origin and an authenticated session.

Sessions use Secure cookies in production, HttpOnly, SameSite=Lax and SDK validation/refresh. Both ownership and revision are checked in each update. No client-supplied user ID is trusted.

The editor saves drafts locally under a per-user key. **Save project** explicitly sends a snapshot to Neon; there is no automatic cloud save yet. **Save a copy** resolves a conflict without overwriting the other version. **My projects** opens a dedicated saved-projects page at `#/projects`. Saved media loads automatically after reloading or switching projects. Older projects need one reattachment and save to upload their media. Signing out revokes the session but retains the per-user local draft on this device.

## Checks

`npm test` includes OAuth state/cookie/refresh checks, origin enforcement, request validation, and real PostgreSQL ownership/revision tests via PGlite.

`scripts/browser-cloud-check.cjs` tests the UI with mocked identity/project responses (not a live WorkOS login). Before declaring setup complete, verify a real hosted sign-in, project save/reload, logout and a second-account ownership check against Neon.

## Private audio/video storage

The `cuestamp-media` private Blob store (IAD1) is connected to Vercel. Save project uploads attached original files directly from the browser using multipart uploads, then saves their asset IDs in Neon. The server issues upload tokens only to the authenticated owner, restricted to an exact generated path, content type, declared size and one-hour expiration, without overwrite. Finalization checks Blob metadata before allowing a project reference. Project copies reuse immutable assets.

Downloads require an owner check and return a GET-only signed URL scoped to one object, expiring after five minutes. URLs and credentials are never saved in the project document. Downloads go directly to Blob; media decoding follows the configured size cutoff. Restore media retries failed downloads without changing cue review flags or movie timing overrides.

- `POST /api/media?action=reserve`: validate metadata and create an owned pending asset.
- `POST /api/media`: issue a constrained client upload token.
- `POST /api/media?action=complete`: verify the uploaded object's size/path/type and mark ready.
- `GET /api/media?id=UUID`: authorize and return a short-lived private download URL.

Per-file application limit: 2 GiB; actual capacity depends on the Vercel plan (the current Hobby store shows 1 GB included storage and 10 GB transfer). The existing browser decoder duration limit still applies. Failed saves retain the local draft; completed uploads are reused on retry. Removing a file from a project removes its reference, not the stored object, so other saved copies remain intact. Orphan cleanup and a permanent-delete UI are not yet implemented; manage unneeded objects in the private Blob dashboard. An interrupted upload before finalization may leave an unused object/reservation.

`scripts/browser-media-check.cjs` tests audio/video save, upload failure, reload/decoding and copy reuse with a mock Blob transport against the Vite dev server. `npm test` also tests real Postgres media ownership and signed-download authorization. A real production login/upload/download round trip is required before calling the hosted integration fully verified.

## Guest entry

First-time signed-out visitors choose Continue as guest, Log in, or Sign up. WorkOS hosts the actual login/signup, verification and password reset forms; Cuestamp never handles passwords. Guest selection is remembered in sessionStorage for the tab and grants no access to account APIs. Guest drafts remain separate from account drafts. Signing out clears the guest-entry preference and returns to the welcome screen.

## Cuestamp domain and naming

Production is `https://cuestamp.com`, backed by the Vercel project `cuestamp` and GitHub repository `Adarsh54/cuestamp` (`master` deploys production). Namecheap BasicDNS holds the apex A record `216.198.79.1` and `www` CNAME `59818d06f1fafed0.vercel-dns-017.com.`. Vercel manages HTTPS. `www.cuestamp.com` and `cuestamp.vercel.app` redirect to the apex; the previous deployment hostname also redirects directly to the apex.

The WorkOS team/application and Google Cloud project/consent app use Cuestamp; the Neon project is `cuestamp` and private Blob store is `cuestamp-media`. Resource IDs, database contents, media ownership and OAuth credentials remain unchanged. The existing WorkOS API-key label is historical; the dashboard exposes expiration editing but no name editing, so the credential was retained.

The frontend migrates legacy storage keys to the Cuestamp prefix on the same origin. Browser-only drafts cannot automatically cross domains; saved account projects are in the existing Neon database. Users sign in again on the new domain. Theme and guest preferences on a new domain start fresh.

Verified after migration: HTTPS, domain redirects, production health endpoint, Google sign-in returning to `cuestamp.com`, and the renamed welcome/guest flow. The repo rename retained the Vercel Git integration and GitHub Pages deployment workflow.

## Hybrid browser/server audio processing

Files <=100,000,000 bytes remain local. Larger files use `/api/analysis`, including in guest mode. `VITE_BROWSER_MAX_MB` can change the cutoff at build time. A movie/reference pair uses the server if either file is large, so its small counterpart also uploads. Audio-only projects route each track independently. Existing 20-minute/2 GiB file limits still apply.

For a new deployment environment:

1. Apply `003_analysis.sql` using `npm run db:migrate` against the intended Neon database.
2. Configure `CRON_SECRET` and enable Fluid Compute; `vercel.json` sets the analysis route to 300 seconds and includes native FFmpeg/ffprobe and the Node worker.
3. Verify guest upload/decode/detection on an isolated preview or an unpromoted production-target deployment (`vercel deploy --prod --skip-domain`). Production credentials are not shared with Git previews. Use the production Origin for API smoke tests against an unpromoted production target, since APP_URL still points at the live domain.
4. Verify the daily `GET /api/analysis` cleanup with `Authorization: Bearer <CRON_SECRET>`. Vercel Cron supplies this automatically in production. Preview deployments need explicit cleanup testing; production schedules do not run there.

`analysis_assets` holds temporary media ownership/metadata, `analysis_limits` enforces daily quotas and `analysis_leases` prevents concurrent processing in one browser session. A sealed HttpOnly cookie identifies temporary guest assets; saved projects/media still require WorkOS account ownership. Clients send owned IDs, never arbitrary source URLs or PCM payloads. Files upload directly to private Blob, avoiding the function body-size limit.

Temporary originals and PCM expire 24 hours after reservation and are deleted by daily cleanup (allow one additional scheduling interval for physical deletion). Saved permanent media uses separate paths. The current save flow may upload a second permanent copy; restoration downloads for playback and may create a new temporary analysis upload. Monitor storage and cron failures.

Limits per UTC day: 40 upload reservations/150 processing attempts per session and 100 reservations/300 attempts per trusted Vercel client IP. These are abuse controls, not billing caps. A request has a 260-second processing deadline; cancelled requests may retain their lease briefly. A retry may therefore ask the user to wait. Expired analysis assets require reattachment. An unavailable server does not silently force large files onto the browser.

### Release verification — September 16, 2026

Migration 003 was applied transactionally to the production Neon branch; all three analysis tables were verified. CRON_SECRET is configured as a Vercel Production secret. An unpromoted production-target deployment verified actual private multipart uploads, native decode and cue detection for 640,044-byte and 105,840,044-byte synthetic WAVs. Both yielded the expected regions. A ten-minute MP4 and reference recording also decoded and matched all four expected repeated/trimmed placements on Vercel. A second guest session was denied access to the first session's asset (404), and authenticated cleanup returned success.

The >100 MB test took about 96 seconds end to end on this connection, including upload and CLI request overhead; this is not a server-compute benchmark. Synthetic test assets use normal 24-hour expiration and daily cleanup. Local tests separately cover browser Wasm, mixed routing, failures/cancellation and saved-media ownership. Live account sign-in/save/restore was verified before this change; this release's hosted smoke tests used guest sessions.

## Published audio reels

Migration `006_reels.sql` adds `reel_audio` (private prepared MP3 paths, waveforms, processing leases) and `reel_publications` (share tokens and published snapshots). Vercel applies it during deployment. The `/api/reels` function includes FFmpeg/ffprobe and has a 300-second limit. It uses the existing server-only Neon and private Blob credentials. A standalone Vite output, `reel.html`, serves public share pages and iframe embeds without authentication.

Publishing is explicit and requires a signed-in owner. Draft saves remain private; re-publishing updates the existing shared snapshot. Revoking deletes the share token, while cached derivatives stay private for reuse. Already downloaded/buffered audio cannot be revoked, and issued Blob URLs last up to five minutes. Every published reel provides MP3 downloads. See CODEX.md for endpoints, limits, storage lifecycle, and the synthetic development smoke test.
