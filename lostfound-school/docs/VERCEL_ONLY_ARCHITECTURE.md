# Vercel-only architecture assessment

This is a local recommendation, not a deployed API. The current Vercel project remains a static Vite frontend. No Functions entry point or routing change was added in this work. Do not create a Render service; earlier Render deployment notes are superseded by this direction.

## Recommended shape

Keep the React/Vite frontend and existing Express application factory. A future Node.js Function can export an initialized Express app that uses `createApp` and `makeAuthenticator`. Keep `server/index.ts` as the local listener; do not start a server or register process signal handlers from a function entry point. A single same-origin `/api` surface avoids a second hosting service. Route `/api/*` to the function before the SPA fallback; the current rewrite sends those requests to HTML and must be changed only with the tested API adapter.

Vercel officially supports Express as a Node.js Function. Use Node 24 and test the Sharp native dependency on Linux; the Edge runtime is unsuitable for this Express/Multer/Sharp stack. See [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

## Audit and required changes before enabling the API

| Area | Current behavior | Required before deployment |
| --- | --- | --- |
| Authentication | Supabase `getUser(token)` verifies identity; rejects anonymous/unconfirmed accounts | Preserve this check on every private request; never trust browser session data as authorization |
| Roles and data | Profile role comes from RLS-protected database; SQL runs with caller JWT | Preserve membership checks, admin middleware, owner checks, RPC grants and RLS; never promote from registration metadata |
| Privileged key | Storage writes only, confined to server client | Set only server environment variable `SUPABASE_STORAGE_SECRET_KEY`; never use a `VITE_` prefix |
| Uploads | Multer buffers one file, maximum 5 MiB; Sharp checks actual bytes, limits pixels, strips metadata and emits WebP | Reduce frontend/server file limit to at most 4 MB with multipart headroom, or design a private quarantine/sanitization workflow. Do not allow direct public/raw uploads to evade sanitization |
| Request size | JSON capped at 32 KiB; platform receives multipart before Express | Test platform-level 413s and a friendly client error. A 5 MiB upload cannot reliably reach this function |
| CORS | Exact configured frontend origin, no wildcard | Prefer same-origin `/api`; explicitly allow intended preview origins only when authorized. CORS is not an auth boundary |
| Rate limits | In-memory `express-rate-limit` counters | Not global across serverless instances; use transactional Supabase-backed limits and/or verified free platform controls. Do not introduce a paid rate-limit store |
| Timeouts | Browser aborts after 20 seconds; SDK requests have no explicit server deadline | Add bounded upstream requests, response/error handling, and measure image decode/upload; align server deadline with client behavior |
| Catalog/matching | Fetches all visible rows, signs every image, computes pairs in memory | Add bounded pagination and query/persisted-match use before larger catalogs; test response size and execution time |
| Cache/privacy | Private API responses currently lack an explicit cache policy | Set private authenticated API responses to `Cache-Control: no-store`; verify no CDN caching between users |
| Storage lifecycle | On failed attachment, new upload is removed; replacing an image leaves old objects | Add narrow, authorized orphan cleanup with tests; no broad deletion jobs |
| Persistence | All data in Supabase, uploads in memory | No reliance on local disk or process memory across requests; no background work after returning a response |
| Configuration | Listener fails closed if backend config missing | Function must return a sanitized unavailable response when unconfigured; frontend should keep auth disabled until backend is ready |

The current published limits document lists a 4.5 MB function request/response payload ceiling. Hobby Node functions with Fluid Compute have a 300-second maximum; this app should target much shorter requests. Function resources and usage remain subject to Hobby limits. Verify the current limits again before deployment: [Vercel Functions limitations](https://vercel.com/docs/functions/limitations).

## Why the backend is not ready to deploy

The static UI is safe without credentials, but full auth requires a real Supabase project and an API that verifies school membership. Merely enabling browser Supabase variables is insufficient. We have not tested token issuance, real email links, remote RLS, Storage or concurrent returns against a live instance. The upload-size mismatch and process-local limiter are known migration blockers, not resolved by exporting Express.

## Release gate for a future Vercel API change

1. Obtain authorized Supabase staging capacity without altering existing projects or billing.
2. Apply the two existing migrations in order and run `supabase/staging/verify.sql`.
3. Configure email verification, redirects, password policy, SMTP and allowlist membership; assign admin roles only through operator-controlled database actions.
4. Implement and locally test the function adapter, routing, limits, timeouts, cache policy and durable rate limiting.
5. Verify function packaging with Sharp on Linux and the platform's multipart/payload behavior.
6. Run live two-student/admin/outsider tests, actual image upload and signed URL tests, and competing return transactions.
7. Review database security advisors and get explicit authorization before any backend deployment.

No paid resources, function routes, Supabase resources or Render services were created by this assessment.
