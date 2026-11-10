# Verification record

Date: 2026-11-10. Windows, Node 24.14.1, npm 11.17.0. These results describe local verification, not a deployed production service.

## Vercel adapter verification (latest local run)

- `npm test`: **40 passed, 0 failed**. Nine new adapter tests cover no-store headers, unconfigured 503, configured paths/JWT/CORS/JSON errors, timeout/cancellation and concurrent isolation, shared limiter failures and write denial, genuine Sharp PNG-to-WebP conversion, 4 MB rejection and routing configuration. One new auth test covers sanitized provider outages. The embedded PostgreSQL test additionally verifies counter access denial, quotas, reset on a new window and user isolation.
- `npm run build`: **passed**, including TypeScript and the API entry point in typecheck. Vite: 1,645 modules; CSS 23.71 kB, JS 315.22 kB. CSS output hash is unchanged from the published redesign; only upload limit/copy changed in the frontend.
- `npm run test:e2e`: **15 passed, 0 failed**, including accessibility, responsive layouts and disabled auth without Supabase.
- `npm run check:env`: **expected failure**, reporting seven missing staging variables by name only. No credentials were invented or set.
- Secret-pattern scan of tracked/new project files: no findings. Production JS contains no Storage secret variable, rate-limit server RPC implementation or test credential markers. `git diff --check` passed. `.vercel/` is now ignored alongside `.env*`.
- No live Supabase, Linux runtime, Vercel Function packaging, actual edge rewrite execution or remote concurrency verification was performed. Local HTTP tests use Supertest and provider fetch doubles; SQL tests use PGlite. Existing CI will exercise the real Sharp conversion on Ubuntu after an authorized push. Frontend Vite build does not package the API Function.

The original two migrations were not edited. The third migration is local only. No commit, push, deployment or external resource changes were made for this adapter work. See [Vercel architecture and next steps](VERCEL_ONLY_ARCHITECTURE.md).

## UI/Auth redesign verification (latest local run)

- `npm test`: **30 passed, 0 failed**, including API contracts, real embedded PostgreSQL RLS/return workflow, auth adapters, environment guards, safe auth messages and emoji-free presentation source.
- `npm run build`: **passed**, including TypeScript; Vite built 1,644 modules. Output: 23.71 kB CSS and 315.23 kB JavaScript (5.86/97.52 kB gzip).
- `npm run test:e2e`: **15 passed, 0 failed**, Chrome, two local configurations (synthetic provider fixtures and completely unset Supabase configuration).
- Browser coverage: signup metadata/confirmation, safe errors, login/persistence/logout, recovery request/callback/update, expired links, delayed/rejected profile authorization, non-JSON API failure, catalog/create/edit/match/claim and admin return UI.
- Axe WCAG A/AA checks: no violations in tested public, student and admin screens. This is automated coverage, not a complete accessibility certification.
- Responsive checks: public landing at 320, 390, 768 and 1440 pixels; student/admin/auth mobile screens at 390 pixels. No horizontal overflow in tested layouts. Mobile menu Escape/focus behavior passed. Desktop/mobile/auth screenshots were visually inspected.
- Page-error assertions in the public/unconfigured scenarios passed. No claim of exhaustive browser-console coverage across every route.
- Source and reachable Git-history pattern scan: no findings for private keys, known token formats, literal JWTs, personal Windows paths, unexpected emails or database credential URLs. No sensitive environment files tracked; `.env`, `.env.local`, `.env.staging` and test output are ignored. Pattern scanning is not a guarantee against every possible secret format.
- Dependency installation reported zero known vulnerabilities. `git diff --check` passed.

Authentication HTTP responses in browser tests are intercepted fixtures, not real Supabase. Database tests use PGlite with minimal Auth/Storage scaffolding. Live signup/email delivery, real Storage, real Supabase RLS and production concurrency remain unverified. No push or deployment was performed for this redesign.

Earlier records below are historical baselines, not the current test counts.

## Original repository baseline

All archive source/config files were inspected before product changes. Initial sandboxed npm installation failed with DNS `ENOTFOUND`; the authorized network-enabled install succeeded, reporting zero known vulnerabilities. Original `npm run build` failed because Windows command shims mishandled `&` in the workspace directory. Direct `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vite/bin/vite.js build` both passed. Scripts now call Node entry points and work in this path.

## Automated checks

Run from `lostfound-school/`:

```text
npm test
npm run build
npm run test:e2e
```

- 21 Node tests passed: seven matching tests, seven HTTP API tests, four authentication adapter tests, one multi-step SQL/RLS workflow test, two storage/pagination adapter tests.
- TypeScript checks and Vite production build passed. The build script includes typecheck.
- Four Playwright/Chrome scenarios passed on `http://127.0.0.1:5173`.
- Render and Vercel templates validated against their current public JSON schemas. This checks structure, not account-specific deployability. An initial YAML `off`/numeric scalar mismatch was corrected by quoting the values. A schema-fetch approval review timed out once; the permitted retry succeeded.
- npm reported zero known vulnerabilities after installation/removal of the unused tsx dependency. This is not a guarantee of application security.

### What tests actually prove

`matching.test.ts`: shared description keywords/punctuation/case, same-type/id exclusion, inclusive three-day dates, no credit for empty attributes, score symmetry, explanations and 39/40/69/70 thresholds. Four initial assertions failed against the prototype and passed after replacement.

`api.test.ts`: real Express HTTP requests through Supertest; authentication/store boundaries use explicit test doubles. Tests exercise 401/403, owner edits, admin gates, unknown privilege fields, malformed dates/ids, error privacy, CORS and rejected malformed/oversize/spoofed uploads. These are API contract tests, not hosted Supabase tests.

`auth.test.ts` and `store.test.ts`: real Supabase JavaScript client with HTTP responses replaced at the external fetch boundary. Tests verify server-side user lookup, verified/non-anonymous identity, membership denial, ignored registration role metadata, claim pagination past 500 rows and missing upload-secret handling. They do not prove real email delivery or token issuance.

`database.test.ts`: executes the complete migration in PGlite (embedded PostgreSQL). Auth users, auth.uid(), Storage tables and roles are minimal local fixtures; business SQL, triggers, permissions and RLS are real. Tests cover:

1. Metadata `role=admin` still creates a student; direct role updates and raw Storage inserts fail.
2. Student A creates Lost; Student B cannot see it before approval or edit it.
3. B creates Found; students cannot moderate; admin approves both.
4. Outsider cannot read/create; approved pair is persisted with score 100.
5. A submits claim; duplicate rejected; B cannot see private evidence.
6. Changing a pending claim's item type cannot result in approval of an invalid pair (review-discovered regression first reproduced as a failing test).
7. Student cannot review; admin cannot skip approval; admin approves then returns.
8. Both items become returned, matching cache clears, repeated return/edit fails.

PGlite does not prove hosted PostgREST response behavior, full GoTrue Auth, Storage signing/upload policies in the live Storage service, or multi-connection lock behavior. The full Supabase stack was not run: Docker engine unavailable; Supabase CLI executable blocked by Windows application-control policy. Neither restriction was bypassed.

### Browser evidence

Browser plugin unavailable; regular Playwright with installed Chrome was used. Tests run real React screens with synthetic API data and a synthetic session, never production users. This fixture exists only in `e2e/` and is not bundled into the app.

| Check | Result |
|---|---|
| Title and meaningful landing content | Pass |
| Public mobile navigation and protected redirect | Pass |
| Registration form | Pass |
| Catalog search → empty state → reset | Pass |
| Create → pending detail → edit → updated detail | Pass |
| Smart Match score and description explanation | Pass |
| Found detail → private claim → dashboard evidence | Pass |
| Student admin-route denial | Pass |
| Admin evidence review → approval → explicit physical return confirmation | Pass |
| Mobile catalog/create horizontal overflow at 390×844 | Pass |
| Desktop landing inspection at 1440×1000 | Pass |
| Browser page exceptions on public/student flows | None |

Screenshots were inspected at `<system-temp>/lostfound-desktop.png` and `<system-temp>/lostfound-mobile.png`. They preserve the original bright layout, illustrations and card structure. No blank page or framework error overlay was observed. Temporary screenshots/reports are outside the repository.

## Required live acceptance before school use

- [ ] Select/configure an authorized staging Supabase project; apply migration and run security advisors.
- [ ] Register two real test students and one staff account, verify email delivery/confirmation and allowlist access. Test logout/reload/expired sessions.
- [ ] Ensure unverified/anonymous/non-member accounts fail through both Express and direct Supabase REST/RPC.
- [ ] Test genuine JPEG/PNG/WebP uploads, malformed content, 5 MiB limits, ownership, metadata removal, signed URL expiry and direct-upload denial.
- [ ] Execute A Lost → B Found → moderation → match → claim → admin approval → physical return through real UI/API/database; confirm persistence from separate browsers.
- [ ] Race two admins reviewing competing claims on separate connections; only one return may succeed. Confirm transaction rollback on failure.
- [ ] Test frontend deep-link reload, CORS and proxy rate limiting on authorized Vercel/Render staging deployments.
- [ ] Confirm the school's membership/admin process, retention/orphan-image cleanup, backups and support ownership.

Production readiness is not claimed until these external checks pass. No deployment or remote push was performed.

## Staging integration preparation — follow-up verification

The current suite has **28 passing local tests** (previous 21 plus four environment-validation tests, two live-test safety-guard tests and one signed-URL error regression). The SQL workflow test now applies both migrations, backfills an account created before the original trigger, denies banned/deleted/anonymous access, verifies client Storage deletion cannot remove an object, and reapplies the hardening migration without changing an existing admin role. `npm run build` and all four Chrome scenarios also pass after these changes. The frontend design was not changed.

`npm run check:env` exits 1 as expected in this workspace: no .env or Supabase runtime variables exist. It lists the missing URL/public-key/Storage-secret/browser/API-origin fields without values. `.env` and `.env.staging` are verified gitignored. Example files contain placeholders only.

Prepared but **not run against a hosted project**:
- `npm run test:staging:register`: public email/password signup for four dedicated inboxes; confirmation must stay enabled.
- `npm run test:staging`: real login, membership and role restrictions, creation, direct RPC denial, sanitized image upload/download, private image denial, moderation, explained/persisted Smart Match, private claim and atomic return.

The live tests require APP_ENV=staging, RUN_STAGING_TESTS=yes, a matching STAGING_PROJECT_REF, complete configuration, manually confirmed users, allowlisted A/B/admin and an operator-promoted admin. No bypass of email confirmation or programmatic role promotion is provided. Test data remains for inspection. See STAGING_SETUP.md for manual steps and migration order.

Review fixes: a separate additive migration preserves the original; account-state checks now apply to direct Data API calls, and image-signing errors are explicit without deleting linked objects. Remaining hosted verification includes actual SMTP, PostgREST/Storage behavior, signed URL expiry, concurrent returns, and security-advisor findings. No remote resources were modified.
