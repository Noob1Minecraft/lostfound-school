# Vercel API adapter: local implementation

No push, deployment, hosted SQL, billing change or Render service is part of this work. The public frontend remains unchanged. This document supersedes the earlier assessment and historical Render instructions.

## Routing and runtime

Project root stays `lostfound-school`, framework Vite, Node 24, build `npm run build`, output `dist`. `api/index.ts` exports the Express app directly, without `listen`, process handlers or startup network calls. `server/index.ts` remains the local listener. Node is required for Express, Multer and Sharp; do not select Edge.

`vercel.json` routes `/api/:path*` to `/api` before the SPA fallback, preserving the original request path for Express. The fallback explicitly excludes `/api` and `/api/*`, as well as assets. Existing `/api/health`, `/api/me`, item CRUD/image, match, claim and admin endpoints retain their paths. Unknown API routes produce JSON errors, never React HTML. SPA routes such as `/login`, `/reset-password` and `/app/items/:id` still return the frontend. Tests verify the routing contract and handler behavior; actual Vercel rewrite execution/packaging remains a preview verification gate.

The default export is deliberately the Express object (with its `.listen` method), not a wrapper that makes Vercel treat it as a plain handler. The Node adapter recognizes Express and leaves JSON/multipart parsing to its middleware. No Next.js-specific body parser setting is needed.

## Request and data protections

- Total response deadline: 15 seconds. Supabase HTTP operations: 8 seconds each, combined with the invocation's abort signal. Client timeout remains 20 seconds; Vercel maximum is explicitly 30 seconds. Abort propagates on disconnect/response completion. Late results cannot send a second JSON response. No post-response background work is scheduled.
- Aborting a request cannot roll back a database write already committed remotely. The timeout message asks users to check the result before retrying; upload cleanup can also be interrupted. No automatic mutation retry is added.
- Every API response, including errors, sets `Cache-Control: private, no-store, max-age=0`, `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`; ETags are disabled. Responses vary on Authorization and Origin.
- CORS uses only `FRONTEND_ORIGIN`; there is no wildcard or reflection of arbitrary preview origins. JWT verification, confirmed/non-anonymous identity, membership, RLS, owner/admin checks remain required. Role metadata from signup is never authority. No service-role SQL client was introduced.
- Missing/invalid server configuration returns a generic JSON 503, with no credential values. Health is a liveness/configuration check, not proof of database connectivity or migration readiness.

## Uploads and Sharp

The browser and Multer share a **4,000,000-byte** image limit. Declared request bodies over 4,200,000 bytes receive 413, leaving multipart headroom below Vercel's 4.5 MB platform ceiling. Multer limits files/parts/fields; JSON stays capped at 32 KiB. The platform can reject larger requests before application code, so its error body may differ.

JPEG, PNG and WebP uploads are decoded, limited to 20 million pixels, resized to at most 1600x1600, stripped of metadata and encoded as WebP before private Storage upload. Sharp processing has an 8-second native timeout. The existing private bucket limit (5 MiB of sanitized output) is unchanged; it is not the browser request limit.

Sharp remains a pinned production dependency. The lockfile includes Linux x64 Sharp and libvips optional packages. Vercel must run `npm ci` on Linux with optional dependencies enabled; never copy Windows `node_modules` into the deployment. The new valid-image test exercises real decoding/encoding and will run on Ubuntu in the existing CI after an authorized push. Windows tests do not verify the Linux binary or final Function bundle; preview packaging and upload checks remain required.

## Rate limiting

Both the local listener and Vercel adapter enable the shared limiter. After verified authentication, every API request consumes a 120-per-minute user budget; mutations additionally consume a 20-per-minute budget. Counters use a single atomic PostgreSQL upsert, shared across instances. Caller identity comes only from `auth.uid()`. Quotas and windows are fixed in SQL; clients cannot choose another user, edit counters or invoke anonymously. Counter storage is bounded to two rows per user, removed on user deletion. A new minute resets the counter on the next request.

The RPC fails closed if absent/unavailable. Quota exhaustion returns 429 and `Retry-After: 60`. These are fixed windows, so boundary bursts are possible. The existing pre-authentication IP limiter is retained as best-effort per-instance protection; it is not a distributed DDoS control. The adapter trusts one Vercel ingress hop, never a caller-supplied hop count. Verify forwarded-header behavior in preview.

The counters protect this Express API. A confirmed member can still access permitted Supabase Data API/RPC operations directly under RLS; API quotas do not establish a database-wide abuse quota. Provider/Auth limits and platform protections must be reviewed before opening access broadly. No paid limiter or external store was introduced.

## Environment variables

Set real values only in the authorized environment, never in Git or chat. Keep frontend Supabase variables unset until the backend and staging checks pass.

| Variable | Location | Required value |
| --- | --- | --- |
| `SUPABASE_URL` | Server | Authorized project HTTPS origin |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Matching public/publishable key (legacy anon supported) |
| `SUPABASE_STORAGE_SECRET_KEY` | Server only | Secret/service-role key used only for sanitized Storage writes; omit to disable uploads |
| `FRONTEND_ORIGIN` | Server | Exact HTTPS frontend origin; production would be `https://lostfound-school.vercel.app` |
| `VITE_SUPABASE_URL` | Browser build | Same project URL, once ready |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser build | Same public key, once ready |
| `VITE_API_URL` | Browser build | `/api` |
| `PORT`, `TRUST_PROXY_HOPS` | Local listener only | Defaults 3001 / 0; adapter does not use these for routing/proxy trust |

Never create `VITE_SUPABASE_STORAGE_SECRET_KEY`, expose service-role values, or put staging test passwords in Vercel. The existing Vite environment validator rejects privileged public configuration. `npm run check:env` checks the complete configured staging environment; it is expected to fail while credentials are absent.

## Supabase preparation and release gates

1. Obtain a new authorized staging project without changing existing projects or billing. Current free-project quota and local CLI application-control restrictions remain blockers; do not bypass Windows security.
2. Apply only missing migrations, in order: `20261110000000_school_mvp.sql`, `20261110010000_staging_hardening.sql`, then **`20261110020000_api_rate_limits.sql`**. Never rewrite/reapply the original migrations. Run `supabase/staging/verify.sql` and inspect every result.
3. Keep `private` unexposed, RLS enabled, Storage private, membership allowlist operator-managed and admin roles operator-assigned. Configure email verification, SMTP, password policy and exact `/login` and `/reset-password` redirects. Review Security Advisor.
4. Configure staging environment securely and run `npm run check:env`, registration and full live integration tests. Verify JWT/role/outsider denial, photos, matches and concurrent returns against actual services.
5. After explicit publication approval, run CI on Linux, build a Vercel preview with the exact project root, and inspect its Function bundle. Verify all API methods, raw multipart parsing, real image upload, CORS/preflight, JSON errors, timeout behavior and no-store headers. Never enable auth against an unverified backend.
6. Check catalog sizes: listing/image-signing and Smart Match still load the visible catalog and compute pairs in memory. Large catalogs can exceed latency, memory or Vercel's response limit; pagination/bounded matching remains follow-up work. Verify expected school data volume before release.
7. Obtain explicit approval before production publication. Do not configure Render or paid features.

## References

- [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel Express handler detection](https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/serverless-handler.mts)
- [Sharp installation and cross-platform dependencies](https://sharp.pixelplumbing.com/install/)

## Local delivery record

Checks: 40 automated tests, 15 browser scenarios, TypeScript and Vite production build passed. `check:env` reports the expected missing configuration. Full evidence and limitations: [TESTING.md](TESTING.md).

Added files:
- `api/index.ts`
- `server/vercel.ts`
- `server/request-context.ts`
- `shared/limits.ts`
- `supabase/migrations/20261110020000_api_rate_limits.sql`
- `tests/vercel.test.ts`

Modified files:
- `.env.example`, `.gitignore`, `README.md`
- `server/app.ts`, `server/index.ts`, `server/store.ts`
- `src/items.tsx` (upload validation and size copy only; design unchanged)
- `vercel.json`, `tsconfig.json`
- `supabase/staging/verify.sql`
- `tests/api.test.ts`, `tests/auth.test.ts`, `tests/database.test.ts`
- `docs/STAGING_SETUP.md`, `docs/TESTING.md`, `docs/VERCEL_ONLY_ARCHITECTURE.md`
