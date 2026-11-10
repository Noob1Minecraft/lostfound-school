# Safe Vercel Preview release plan

Status: local audit complete; publication is NOT authorized by this document. No commit, push, deployment, remote environment edit, Supabase mutation or billing change was performed. The 22-file implementation snapshot was reviewed without source changes; this plan is the only new repository file from the final-readiness task.

## Readiness evidence

- 40 automated tests and 15 browser scenarios passed again. TypeScript and Vite production build passed.
- Missing/invalid server configuration returns generic JSON 503 with no-store headers, including `/api/health`; no provider calls are needed. Unconfigured browser auth collects no credentials.
- API routing configuration excludes API paths from the SPA fallback. Local tests exercise the Express adapter, CORS, auth/role checks, quota rejection, cancellation and real Sharp image conversion. They do not execute Vercel's edge rewrite engine.
- Public environment validation rejects recognized privileged Supabase keys and secret-named `VITE_*` variables. Current generated JS contains no server Storage-key reference, limiter implementation or test credential markers. No secret-pattern findings in 73 tracked/new project files. This does not guarantee safety if a future operator puts an arbitrary unrecognized secret in another `VITE_*` variable: treat every `VITE_*` value as public and allow only the three documented names.
- Production was read-only checked: HTTP 200; assets `/assets/index-DzMPoN8p.js` and `/assets/index-B6gpkrqz.css`. Local pending backend build uses `index-DgKzOiHP.js`; CSS hash is unchanged. HEAD remains `c20e6f90197433a82dff98207eb2bdd3a4f1ef50`.
- No confirmed new security vulnerability found in the 22 changed files. Existing availability limitations remain: full-catalog matching/signing, per-instance pre-auth IP protection, API quotas not applying to direct RLS-authorized Supabase operations, and cancellation not rolling back committed writes.

## Phase A: preview without any Supabase credentials

### Preview packaging regression

The first authorized Preview built successfully but `/api/health` failed at startup: emitted `api/index.js` still imported `server/vercel.ts`. Enable TypeScript's `rewriteRelativeImportExtensions` so emitted modules refer to `.js`. `tests/emitted-api.test.ts` now transpiles the API/server/shared modules into an isolated JavaScript-only directory, imports the real entry point and verifies the credential-free JSON 503/no-store response. It reproduced the original missing-module error before the configuration fix. This increases the automated suite to 41 tests; it complements, rather than replaces, hosted Linux Function verification.

This phase can verify packaging and safe failure without consuming Supabase quota. Execute only after explicit approval to commit/push the preview branch.

1. In Vercel, verify the existing **Enginnerus / lostfound-school** project links to **Noob1Minecraft/lostfound-school**, its production branch is **main**, and the live domain still points to the existing production deployment. Record that deployment ID/commit and current asset hashes. The connector previously lacked access, so Dashboard verification may be required. Stop if these settings cannot be confirmed.
2. Confirm root `lostfound-school`, framework Vite, Node 24, install `npm ci`, build `npm run build`, output `dist`. Keep existing Hobby plan. Do not change domains, production branch, shared project settings or paid features. The checked-in Function maxDuration is 30 seconds.
3. Inspect Preview-scoped and shared environment inheritance. The new preview must receive **no** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_STORAGE_SECRET_KEY`, `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY`. `VITE_API_URL=/api` is safe. Do not use invented placeholder credentials. If existing Preview/shared credentials would be inherited, stop and prepare a reviewed branch-specific isolation change; do not delete or alter unrelated settings. Do not pull/export secret values into logs.
4. Use existing free deployment protection where available. Do not disable protection to make a test pass, enable paid protection, or publish bypass tokens. A protection login page is not an application response: authenticate through the Dashboard/browser before evaluating application checks.
5. From the repository root, after approval, create the non-production branch and inspect the exact files to commit:

   ```powershell
   git switch -c codex/vercel-api-preview
   git status --short
   # Review and stage only the audited lostfound-school project files and this plan.
   # Create a descriptive commit, rerun final checks if source changed, then:
   git push -u origin codex/vercel-api-preview
   ```

   Never push this backend change to `main` during preview. Do not use force push, `--prod`, promotion, production redeploy or alias assignment. If the branch already exists, inspect it rather than overwriting it.
6. Observe GitHub Actions and the automatic Vercel deployment for the **exact new SHA**, with target **Preview**. Verify Vercel installs Linux optional dependencies, builds the static site, and packages `api/index.ts` as a Node Function. A successful Vite build alone is insufficient.
7. Use the deployment URL returned by Vercel, not a guessed hostname. Record both its immutable URL and stable branch preview alias. Run the Phase A matrix below. Check production again: same deployment/commit and published asset hashes, HTTP 200. A preview is separate from production only while the branch, environment and alias rules above remain intact.

### Phase A acceptance matrix

| Request/check | Expected |
| --- | --- |
| GET `/`, `/login`, `/register`, `/forgot-password`, `/reset-password` | HTTP 200 HTML; frontend renders; auth unavailable; no credential inputs/provider calls |
| Direct navigation `/app/dashboard`, `/admin` | SPA loads and redirects to login, no private data |
| Loaded JS/CSS paths | HTTP 200 with correct content type; no console errors |
| GET `/api`, `/api/health`, `/api/me`, `/api/items`, `/api/admin/stats`, `/api/not-a-route` | Generic JSON 503 while unconfigured; never index.html or Vercel module-load crash |
| POST/PATCH API paths with a harmless empty JSON body | JSON 503 while unconfigured; no mutation/provider call |
| API headers | `Cache-Control: private, no-store, max-age=0`; no ETag; no cache HIT on repeated requests |
| Mobile 320/390 px and desktop 1440 px | No horizontal overflow; SVG design retained; menu works |

For an accessible unprotected preview, unauthenticated probes can use:

```powershell
$previewUrl = 'https://<exact-preview-host-from-dashboard>'
curl.exe -sS -D - "$previewUrl/api/health"
curl.exe -sS -D - "$previewUrl/login"
curl.exe -sS -D - -X POST -H 'Content-Type: application/json' --data '{}' "$previewUrl/api/items"
```

For protected previews use the authorized browser's Network panel. Do not save HAR files containing cookies/tokens. Vercel may consume `Vercel-CDN-Cache-Control` internally; its absence from the client response alone is not a failure. The handler tests verify that it is set; check client no-store and actual cache behavior. An edge/protection/platform error can have different headers than an application-generated response.

Because Sharp is imported at Function startup, a JSON503 proves the native module can load in that bundle. It does NOT prove real image conversion or Storage upload.

## Phase B: configured staging preview (currently blocked)

Requires a new authorized Supabase staging project; never reuse or modify an existing production project. Current quota/CLI restrictions remain. Do not bypass Windows Application Control or upgrade billing.

1. After separate Supabase authorization, apply the three migrations in order: `20261110000000_school_mvp.sql`, `20261110010000_staging_hardening.sql`, `20261110020000_api_rate_limits.sql`. Apply only missing migrations. Run `supabase/staging/verify.sql` and Security Advisor.
2. Configure verified staging accounts, school allowlist and operator-assigned admin; email confirmation, private Storage and exact auth redirects. Use the **stable branch preview origin** for `FRONTEND_ORIGIN` and exact `/login` and `/reset-password` redirect entries. Open this origin for browser tests; a different immutable deployment hostname will not match CORS. No wildcard production redirects.
3. Scope variables to Preview and **only codex/vercel-api-preview**: server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_STORAGE_SECRET_KEY`, `FRONTEND_ORIGIN`; browser `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL=/api`. Use staging values exclusively. Never prefix privileged keys with VITE_; keep test passwords out of Vercel variables. Changing environment values requires a new preview build. Do not apply them to Production or all branches.
4. Run the environment checker locally with securely configured staging values, then the existing opt-in live registration/workflow tests against this preview. Inspect integration guards before setting opt-in flags. Never change them to accept a production project.
5. Verify configured `/api/health` gives200; missing/invalid JWT gives401; valid student `/api/me` gives200; outsider/admin denial gives403; authorized unknown API route gives JSON404. Test query strings, POST/PATCH bodies and image multipart paths, not only health. Preflight must allow only the exact preview origin; a different Origin must receive403. All application success/error responses must remain no-store. Check two users cannot see each other's restricted data.
6. On throwaway staging records, test quota exhaustion gives429 with Retry-After60, independent user quotas, reset after the minute window, and repeated requests across separate invocations. Missing limiter migration must fail503 rather than silently disabling limits. Do not run load tests or spend-heavy scans.
7. Check Linux Sharp end-to-end: upload small valid JPEG, PNG and WebP files to an item owned by a staging student. Confirm WebP output, dimensions at most1600x1600, metadata stripping, private object, authorized signed URL, and rejection of another student's upload. Verify malformed bytes and a4,000,001-byte file are rejected; a larger platform-rejected body may produce its own413. Inspect Function logs for native module/ELF/libvips errors without recording tokens. Ubuntu CI's real conversion test must also pass.
8. Test Smart Match and the complete two-student/admin return flow. Use representative catalog volume to assess full-list image signing and pair computation before approving broader access.

## Timeout verification on Vercel

Normal fast requests do not prove a deadline. Browser network throttling alone does not test server-side upstream cancellation. Do not use production data, overload Supabase or add an arbitrary URL/delay parameter to the application.

For deterministic platform evidence, obtain approval for a **temporary, protected, credential-free diagnostic preview** on a separate probe branch. Its test-only entry point should import the unchanged `createApp` and request-context modules and inject an authenticator delayed20 seconds with no successful identity/store. A single request must receive sanitized JSON504 around15 seconds, before the30-second Function ceiling; a later completion must not trigger a second response or unhandled exception. An additional probe should call `boundedFetch` against an explicitly controlled, credential-free delayed test endpoint to verify its8-second abort and independent concurrent fast request. It must not accept caller-selected destinations. This harness is not implemented or deployed in this patch and must never be merged into main or used as real authentication.

Retain only redacted timings/status/log evidence. Remove the diagnostic deployment when authorized, return to the clean audited branch and verify its separate exact SHA. Until this controlled probe is approved/run, report hosted timeout behavior as **unverified**, even though local cancellation tests pass. A timed-out mutation may have committed remotely; inspect the outcome before retrying.

## Stop conditions and production isolation

Stop on CI/build failure, SPA HTML at an API path, credential inheritance/mismatch, unexpected public data, missing no-store behavior, wrong origin, native-image failure, or unexpected billing prompt. Do not repair these by disabling RLS/auth/protection. Leave production untouched and report evidence. No production promotion is included in preview approval; a later release needs its own approval and configured-service acceptance.

Official references: [Vercel environments](https://vercel.com/docs/deployments/environments), [environment variables](https://vercel.com/docs/environment-variables), [deployment protection](https://vercel.com/docs/deployment-protection), [CLI deployment targets](https://vercel.com/docs/cli/deploy). Account-specific configuration still needs Dashboard verification.
