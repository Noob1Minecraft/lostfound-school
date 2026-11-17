# Free Vercel + Neon setup and release gates

Status: local implementation only. No Neon project, credential, bucket, account or deployment was created. The complete hosted workflow has NOT passed. Existing Engineerus Quest projects and production are unchanged.

## Architecture decision

Keep React and the existing Express Vercel Function. Add an explicit Neon provider, retaining the Supabase adapter and original migrations. Managed Neon Auth handles passwords, verification, reset and sessions. A restricted same-origin `/api/auth` proxy avoids cross-site session cookies. Business `/api` requests verify the managed session, map its external ID to an internal UUID, and run PostgreSQL functions under restricted transaction-local roles. Application roles come from school profiles, never authentication metadata. Private object storage uses scoped server credentials and short-lived signed reads; uploads pass through existing Sharp WebP processing.

Neon is not a Supabase replacement by connection-string substitution. The new standalone migration replaces `auth.users`, `auth.uid()`, PostgREST roles and Supabase Storage policies. SQL business functions, matching, claims, return transitions and rate limits are ported. Managed Auth data remains provider-owned; no password table or custom password hashing exists here. The original Supabase migrations must NOT be applied to Neon. No existing user data was migrated; any later real-data migration needs a separate reviewed export/import and identity reconciliation plan.

Supabase would require another available free project; the reported quota is exhausted. A new organization does not reliably create additional free eligibility. Self-hosted Supabase needs persistent infrastructure and operations, unsuitable for this no-cost/no-local-server requirement. Neon Postgres plus a separate auth/storage provider remains possible but adds credentials, policy surfaces and integration work. Neon Auth and Object Storage preserve managed operation in one independent project, subject to regional/account availability.

## Current free limits (checked 2026-11-11)

| Service | Free allowance / constraint |
| --- | --- |
| Neon | $0 (0 KZT), no card required; 100 CU-hours/project/month, 1 GB PostgreSQL/project, 60,000 auth MAU/project, 5 GB object storage and 5 GB network transfer/project. Up to 10 branches. Compute scales to zero after inactivity. |
| Quota exhaustion | Compute/network exhaustion suspends compute until the next period. Database growth is rejected above 1 GB/project or 20 GB total. Free is capacity-limited, not a guaranteed always-on school service. |
| Object Storage | Available in Ohio, N. Virginia, Frankfurt and Singapore. Choose a supported region; do not assume Seoul support. Branches inherit data and objects, so do not fork student production data into testing. |
| Vercel Hobby | Free only for eligible personal, non-commercial use; a school-operated application must confirm eligibility. Functions have a 4.5 MB buffered request/response limit. This application permits 4,000,000-byte image files, caps processing, and retains 30-second function/15-second app deadlines. |

Sources: [Neon pricing and exhaustion rules](https://neon.com/pricing), [Object Storage regions](https://neon.com/docs/storage/overview), [Vercel Hobby terms](https://vercel.com/docs/plans/hobby), [Function limits](https://vercel.com/docs/functions/limitations). No paid fallback is authorized. Default email delivery availability, anti-abuse limits and deliverability must be checked in the actual managed Auth project; do not assume unlimited email sending.

## Manual provisioning after approval

1. Create an independent **Free** Neon project for Lost&Found, preferably Singapore or Frankfurt based on measured latency and approved data location. Do not connect or transfer Engineerus Quest resources. Confirm Auth and Object Storage are available before proceeding. Stop if a card, paid plan or unsupported region is required.
2. Use an empty Preview database with synthetic data. Enable managed Auth for that branch. Record the branch Auth base URL privately. Enable email/password, require verified email, configure password-reset session revocation and provider abuse protection where available. Configure the exact HTTPS Preview origin as trusted; avoid wildcard callback origins. Confirm real verification/reset email delivery. See `NEON_AUTH.md` for the proxy contract and hosted gates.
3. In Neon SQL Editor, connected as migration owner to that empty database, apply **only `neon/migrations/001_school.sql`**, once. It is one atomic transaction. It creates `school_app` and `school_identity` NOLOGIN roles, schema, RLS, business functions and counters. If it fails, inspect the error and roll back; do not disable RLS or retry partial fragments.
4. Create a separate PostgreSQL login named `school_runtime`, with a generated unique password, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. Grant `school_app, school_identity` to it and CONNECT to this database. Never use `neondb_owner` as the runtime. The app validates the login name and explicitly sets a restricted role in every transaction. Password creation belongs in a private Dashboard/SQL session; never put it in this document, Git, command output or a client variable.
5. Run `neon/verify.sql` as the owner. Confirm RLS is enabled, application roles own no tables, direct mutations and identity provisioning are not granted to `school_app`, and definer functions use pinned search paths. Test connecting as `school_runtime` separately.
6. Bootstrap the first administrator: add their verified, intended email to `private.school_members` as owner; let them register, verify and sign in once (creates the default **student** profile); then, as owner, promote exactly the profile joined through `private.identities` to that verified email. Verify the selected row before the update. No signup metadata or public API can bootstrap an administrator. Afterwards admins use the School access panel to admit students and manage roles. A member must sign in once before promotion. The last active administrator cannot be removed.
7. Create a **private** `item-images` bucket. Obtain its branch S3 endpoint/region and branch-scoped `storage:read` + `storage:write` credentials. Do not use an account-wide management API key. SDK path-style addressing is mandatory. Confirm anonymous unsigned object access returns 401/403/404. [Credential documentation](https://neon.com/docs/storage/authentication), [S3 compatibility](https://neon.com/docs/storage/s3-compatibility).
8. Configure **Preview only** environment variables below in the existing Lost&Found Vercel project. No production environment changes. Root remains `lostfound-school`, framework Vite, command `npm run build`, output `dist`; existing API/SPA rewrites stay intact. Set FRONTEND_ORIGIN to the stable approved Preview hostname and use it for browser/API/email tests.

Owner-only setup templates (replace placeholders privately; never commit the filled versions):

```sql
CREATE ROLE school_runtime LOGIN PASSWORD '<generated-unique-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT school_app, school_identity TO school_runtime;
GRANT CONNECT ON DATABASE "<actual-database-name>" TO school_runtime;

-- Before the intended administrator's first verified sign-in:
INSERT INTO private.school_members(email, active)
VALUES (lower('<verified-admin-email>'), true);

-- After that sign-in, inspect exactly one identity/profile before promoting:
SELECT p.id, p.role FROM public.profiles p
JOIN private.identities i ON i.user_id = p.id
WHERE i.email = lower('<verified-admin-email>');
UPDATE public.profiles p SET role = 'admin'
FROM private.identities i
WHERE i.user_id = p.id AND i.email = lower('<verified-admin-email>')
RETURNING p.id, p.role;
```

These commands target the new empty project's database only. If the owner cannot create restricted roles, stop and investigate supported Neon privileges; do not substitute an owner credential in the application.

## Environment variables

| Browser/public | Value |
| --- | --- |
| `VITE_AUTH_PROVIDER` | `neon` |
| `VITE_API_URL` | `/api` |
| `VITE_SUPABASE_*` | Unset in Neon mode |

| Server only | Value |
| --- | --- |
| `BACKEND_PROVIDER` | `neon` |
| `FRONTEND_ORIGIN` | Exact HTTPS Preview origin, no trailing slash |
| `DATABASE_URL` | Neon pooled PostgreSQL connection for `school_runtime`, `sslmode=verify-full`; no other URL query options |
| `NEON_AUTH_URL` | Actual branch managed Auth base URL including path |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Actual storage endpoint, region, private bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Scoped storage credentials |

All sensitive values stay in ignored local `.env*` files or the correct Vercel environment. No privileged value may use `VITE_`; unknown browser variable names are rejected. `npm run check:env` checks structure only, not connectivity. Missing provider configuration returns JSON 503. Merely selecting Neon in the frontend does not make authentication live. Local HTTP development cannot exercise Secure cookies; use an authorized HTTPS Preview for real integration. End users need only a browser.

## Test and Preview release procedure

1. Resolve the current Windows Application Control block on the signed/approved build tool through an officially supported approval/install route, or use a separately authorized supported development environment. Do not disable or bypass protections. Re-run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:neon` and secret scanning. The two browser suites contain test-only synthetic network fixtures, not proof of hosted auth.
2. Review the uncommitted diff and authorize publication separately. Then push only a Preview branch normally; do not merge main. CI now includes both browser suites. Check that Vercel produces a **Preview**, with no production credentials inherited. Verify production URL/asset hashes are unchanged.
3. In Preview, register Student A, Student B and the intended administrator with separate synthetic inboxes. Verify actual email delivery and links, login/logout, reload persistence, password reset, old-password rejection, reset-link replay rejection and revocation of earlier sessions. Confirm unverified/banned users cannot access school data and nonmembers are denied. Bootstrap/admit the accounts as above.
4. Store synthetic test credentials only in ignored `.env.preview`: `APP_ENV=preview`, `RUN_NEON_PREVIEW_TESTS=yes`, `NEON_PREVIEW_ORIGIN`, `NEON_PREVIEW_EXPECTED_HOST` (the same exact non-production hostname), and `NEON_TEST_A_EMAIL/PASSWORD`, `NEON_TEST_B_EMAIL/PASSWORD`, `NEON_TEST_ADMIN_EMAIL/PASSWORD`. Run `npm run test:preview:neon`. It refuses the production hostname. It creates synthetic records, uploads a generated PNG, verifies private WebP retrieval, moderation, matching, claims, returned status and a fresh authenticated reload. It intentionally retains synthetic evidence for inspection. No test credentials are printed by the harness.
5. Test cross-origin POST denial, role/owner injection, another student's edit, private claim evidence, last-admin removal, invalid/oversized images, rate-limit boundaries and two-connection revocation while a write waits on an advisory lock. `neon/verify.sql` describes the concurrency gate. Check Linux Sharp startup, upload limits, cold starts, database TLS, cancellation/rollback, API JSON errors/no-store headers, SPA deep links, assets, mobile overflow, accessibility and console errors.
6. Record actual results; do not convert mock or embedded-database results into hosted claims. Production approval is requested only after every security and live workflow check passes. An eventual production release needs its own empty/approved database, auth origin and secrets, followed by migration verification and controlled account bootstrap. Promote/merge only with explicit approval and a rollback plan retaining the previous frontend deployment.

## Operational limitations

Auth abuse protection before login is provider-managed plus per-instance API limiting; authenticated business quotas are shared PostgreSQL counters. Listing/matching currently processes the visible catalog in memory and matching is quadratic; pagination and indexed candidate selection are needed before large-school scale. Signed image URLs remain usable for at most ten minutes after access changes. Best-effort object cleanup can leave orphan files after interrupted operations; monitor private bucket usage and reconcile against referenced paths before removing anything. No automatic production deletion job is introduced. Backups, retention, student-data consent and regional hosting approval must be agreed before real student data is collected. Managed Auth contracts, Linux startup, email delivery, real concurrent PostgreSQL behavior and Hobby eligibility remain release gates.
