# Architecture

Single school, Russian UI, students and administrators. The original landing illustration, colors, cards, filters and responsive CSS remain. Authenticated data replaces browser-local demo entries; no demo records are seeded in production.

## Boundaries

- `src/catalog.tsx`: retained landing/catalog/card design.
- `src/auth.tsx`: Supabase session lifecycle, authenticated API requests and timeout handling.
- `src/App.tsx`: routing, auth forms, role gates, student dashboard and item loading.
- `src/items.tsx`: create/edit/detail, image submission and private ownership claims.
- `src/workflows.tsx`: Smart Match explanations, claims and moderation.
- `shared/`: domain types and deterministic matching, shared by API/UI.
- `server/`: Express 5 API, Zod validation, Supabase adapter, image sanitization.
- `supabase/migrations/`: database constraints, RLS, atomic workflow functions and private Storage bucket.

The browser uses only a Supabase publishable key. Express calls `auth.getUser(token)` for every protected request, checks verified/non-anonymous identity, then reads a profile using that token. RLS hides profiles of users outside the administrator-managed school email allowlist. A session in localStorage is not proof of authorization. All SQL reads and RPC calls use the caller's JWT; the server never uses its secret key to bypass database permissions.

The server-only `SUPABASE_STORAGE_SECRET_KEY` is confined to sanitized Storage writes and failed-upload cleanup. Client INSERT/UPDATE policies for the image bucket are absent, preventing direct upload bypass. Uploads require item ownership, allow JPEG/PNG/WebP up to 5 MiB, decode at most 20 million pixels, remove metadata, correct orientation, resize to at most 1600×1600 and re-encode WebP. Image paths are immutable and ownership-scoped. Attaching an image checks ownership and existence and returns the item to pending moderation. Ten-minute signed URLs permit viewing private images. Replaced images remain unreferenced until operator cleanup; client Storage deletion is disabled to avoid attachment races. Do not delete linked objects.

## Data and permissions

`profiles` contains display name and database-controlled role, without email/contact fields. A registration trigger always sets student; user metadata can provide only a bounded display name. `private.school_members` controls access by verified email. The follow-up staging migration backfills pre-existing users as students and denies banned, deleted and anonymous accounts at the database boundary. Only database operators manage membership and admin assignment. It is never exposed through the app API.

`items` contains owner, Lost/Found type, attributes, pending/approved/rejected/returned state and an optional private image path. Members see approved/returned listings; owners see their own pending/rejected records; administrators see all. Edits are owner-only, return to pending, and are blocked for returned items or approved claims. Direct table DML is revoked; explicit RPC operations enforce authorization independently of Express.

`claims` links a claimant-owned Lost listing and another person's Found listing. Evidence and review notes are visible only to the claimant and administrators. Pending → approved/rejected; approved → returned/rejected. Approval and return revalidate type, ownership and availability. Returned/rejected claims are terminal. Duplicate claimant/item pairs are rejected. Admin confirmation updates the claim, both listings and competing claims in one transaction. A school-scoped advisory transaction lock serializes mutations; ordered item/claim row locks and partial unique return indexes add protection. This trades write throughput for simple correctness in a single-school MVP. Multi-connection contention still needs staging verification.

`matches` is a trigger-maintained derived cache of approved Lost/Found pairs scoring at least 40. Students cannot write scores. API matches are computed from authorized current listings using the shared TypeScript implementation, so cached rows are never authorization inputs. SQL parity is tested for the full-score example; broaden corpus parity tests before changing either implementation.

## Matching

Category 30, normalized color 20, normalized location 20, dates within three calendar days 15, at least one shared description keyword 15. Keywords are case folded, ё→е, punctuation-separated, at least four characters, with a small fixed stop list. Same type/id returns zero. Scores 70–100 are high, 40–69 possible, 0–39 low; only scores ≥40 are suggested. Scores are heuristics, never statistical probabilities. No AI service or personal data inference is used.

## API contract

All routes except `/api/health` require a bearer token and school membership. Errors are JSON `{error, fields?}` with 400 validation, 401 authentication, 403 permission, 404 missing, 409 state conflict, 429 rate limit, 500/503 server/storage failure.

| Route | Purpose |
|---|---|
| GET /api/me | Current permitted profile |
| GET /api/items | RLS-visible listings (frontend search/filter) |
| GET /api/items/:id | Visible item |
| POST /api/items | Create pending listing |
| PATCH /api/items/:id | Owner edit; pending moderation |
| POST /api/items/:id/image | Multipart `image`, sanitized upload |
| GET /api/matches | Explained current approved matches |
| GET /api/claims | Own claims (all claims for admins) |
| POST /api/claims | Private evidence plus Lost/Found ids |
| GET /api/admin/claims | Admin claim review queue |
| PATCH /api/admin/claims/:id | Approve, reject, confirm return |
| PATCH /api/admin/items/:id | Approve/reject moderation |
| GET /api/admin/stats | Database-backed aggregate counts |

CORS allows the configured frontend origin. Header tokens avoid cookie-based CSRF. Helmet sets API response protections. Limits are 120 requests/minute/IP and 20 writes/minute/user, with in-memory state for one API instance. Supabase Auth's own rate limits protect sign-in. Before scaling horizontally, use a shared limiter store. Catalogs/claims page through PostgREST internally; API still returns the full visible collection. Server-side pagination/indexed matching are future scale work, not needed for the intended small school.

References: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Environment validation is shared in `shared/config.ts`. `npm run check:env` compares server and browser settings without printing values. Vite rejects privileged values in public variables before serving/building. Live staging suites are isolated in `integration/`, require project-reference matching and explicit opt-in, and are excluded from default local tests. See STAGING_SETUP.md.
