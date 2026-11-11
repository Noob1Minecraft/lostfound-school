# Backend hosting assessment — 2026-11-11

Assessment only. No cloud resources, paid subscriptions, production settings, commits or pushes were changed. Reviewed branch: `codex/vercel-api-preview`, commit `412ac2881a0fa19c4b4696617f6f1da63e95f8bf`. Existing Quest projects are out of scope.

## Recommendation

Keep React and Express Functions on the existing Vercel project. Use a new, independently billed Supabase Pro organization exclusively for Lost&Found School, with a dedicated project for initial staging. Preserve Supabase Auth, PostgreSQL/PostgREST, RPC authorization and private Storage. Configure custom SMTP using a verified sending domain. This is the fastest route with the smallest application/security change surface, subject to explicit billing and resource-creation approval.

Start with one Micro project at approximately USD25/month. For sustained production with isolated staging, budget approximately USD35/month for two Micro projects in the new organization. Do not upgrade the existing Quest organization or transfer its projects. No custom Supabase domain, dedicated IPv4, PITR, log drain or paid image-transform service is required for the initial pilot. Email/domain costs are separate.

If the budget is strictly zero, Oracle Always Free running official self-hosted Supabase is a conditional alternative, not an equally reliable managed replacement. Capacity, account eligibility, ARM image compatibility and operational ownership must be established first. Do not bypass Windows controls; the managed option can use Dashboard SQL Editor, and self-hosting runs on a separately approved Linux server.

## Existing architecture and security dependencies

- `src/auth.tsx` uses supabase-js registration/login/recovery/session behavior. The API verifies tokens through `auth.getUser`, rejects unconfirmed/anonymous accounts and obtains the role from an RLS-protected profile. Client metadata does not grant admin.
- `server/store.ts` uses PostgREST reads and RPC writes under each user's JWT. SQL depends on Supabase `auth.users`, `auth.uid()`, authenticated/anon roles, and Storage schemas. A plain PostgreSQL connection string is not a replacement.
- Public profiles/items/matches/claims use RLS; private membership and rate counters also have RLS. Writes pass through narrow private SECURITY DEFINER functions with pinned search paths, membership/ownership/admin checks and public SECURITY INVOKER wrappers. Grants/revocations are part of the security model, not optional setup.
- The third migration provides shared per-user request budgets across Function instances. Do not omit it. Direct RLS-authorized Supabase RPC access is not covered by Express's request budget; retain provider limits and assess direct-call abuse before broad rollout.
- Images enter Express with a 4,000,000-byte file limit, are decoded/resized/sanitized through Sharp, then stored as WebP in private `item-images`. Bucket limit is 5,242,880 bytes; read URLs expire after 600 seconds. The privileged Storage client is server-only; SQL operations keep the user's JWT.
- Application deadline is 15 seconds, upstream fetch deadline 8 seconds, Vercel ceiling 30 seconds. Catalog-wide reads/signing and matching need representative-volume testing. A timeout does not prove a database write was rolled back.
- No hosted Supabase workflow has yet been verified. Previous local/CI evidence: 41 automated tests and 15 browser scenarios, including an emitted-JavaScript startup regression. Tests were not rerun for this documentation-only assessment.

## Cost and options

Prices checked 2026-11-11. KZT estimates use USD1 = KZT447.52, reported for that date by [Informburo's NBK-based series](https://informburo.kz/kurs-valyut/pair/usd-kzt). The direct NBK feed was unavailable to the research tool. These are conversions, not bank settlement quotes; tax, card FX, domains, backups and overages may add cost. Engineering times below are estimates after access and approvals, not provider guarantees.

| Option | Recurring infrastructure estimate | Effort and compatibility | Security/operational tradeoff |
| --- | --- | --- | --- |
| Separate managed Supabase Pro, one Micro | USD25 ≈ KZT11,188/month | About 1–2 engineering days plus email/DNS validation; highest compatibility | Provider operates database/Auth/Storage; still requires RLS, SMTP, restore and privacy testing |
| Same new organization, isolated staging + production Micro projects | USD35 ≈ KZT15,663/month | Same implementation; separate envs and migration histories | Recommended ongoing separation; shared organization usage allowances |
| Official Supabase Docker on Oracle Always Free | USD0 / KZT0 within eligible resources; domain/backup/email may cost extra | Roughly 2–5 days after VM availability, plus recurring administration; high API compatibility | Capacity shortages and idle reclamation; no managed Supabase operations; validate ARM images |
| Official Supabase Docker on DigitalOcean Basic | 2 vCPU/4 GiB/80 GiB USD24 ≈ KZT10,740; 4 vCPU/8 GiB/160 GiB USD48 ≈ KZT21,481/month, before backups | Roughly 2–5 days; high compatibility | Operator patches, secures, monitors and restores everything; little cost advantage at this provider |
| Neon managed PostgreSQL + Better Auth + object storage | Free tier USD0 / KZT0 within allowances; advertised Launch typical spend USD15 ≈ KZT6,713, not a fixed bundle quote | Approximately 1–2+ weeks including security regression work; Vercel-compatible but not a Supabase API drop-in | New auth SDK/session/JWT integration, SQL identity context, storage authorization and migration changes need full review |

Sources: [Supabase pricing](https://supabase.com/pricing), [organization billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets), [Neon pricing](https://neon.com/pricing).

Supabase Free allows two active projects across organizations where the user is Owner/Administrator; a new Free organization does not create additional entitlement. Free limits include 500 MB database, 1 GB files, 50,000 MAU and 5 GB uncached plus 5 GB cached egress; inactivity can pause a project after a week. The current account therefore has no available supported free hosted slot without changing the stated constraints. See [billing rules](https://supabase.com/docs/guides/platform/billing-on-supabase).

Pro includes USD10/month compute credit, covering one Micro; a second Micro adds approximately USD10/month. Included allowances include 8 GB disk per project, 100 GB file storage, 100,000 MAU and 250 GB each uncached/cached egress. Organization allowances are shared. Keep the spend cap enabled, but do not treat it as a universal cap on compute/add-ons; review the project estimate before approval.

Oracle's current official page specifies 1,500 A1 OCPU-hours and 9,000 GB-hours/month, equivalent to 2 OCPUs/12 GB, not the older 4-OCPU/24-GB claim. Only eligible home-region resources qualify; idle instances may be reclaimed and capacity is not guaranteed. Do not use artificial load to evade reclamation. Free credits for paid trial resources are not permanent free hosting.

Neon's current pricing advertises 100 free projects, 100 CU-hours/project/month, 1 GB database/project, managed Better Auth and 5 GB object storage. These services do not implement this project's Supabase auth/storage APIs or schema contracts. Verify region availability, service-specific limits, session/SMTP behavior and storage access controls before selecting it. Do not silently replace SQL RLS with an unrestricted service database connection.

## Exact hosting requirements

For the recommended managed option:

1. A separate Supabase organization, new project reference, Micro compute, generated database password, operator MFA and independently approved billing. Use a supported region close to the Vercel Function region; measure latency before settling on Seoul or another region. No Quest credentials or records are reused.
2. Supabase Auth, Postgres, PostgREST Data API with explicit grants/RPC access, and private Storage. No separate database pooler configuration is needed for the app because it uses HTTPS APIs rather than raw SQL connections.
3. A verified sender domain/subdomain with required SPF/DKIM and an appropriate DMARC policy, plus custom SMTP. Supabase's default sender only delivers to project-team addresses and is currently limited to two messages/hour: [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp). Do not add students as Dashboard team members to work around this.
4. Resend is one SMTP candidate: free 3,000 messages/month and 100/day; paid Pro USD20 ≈ KZT8,950/month if required. Onboarding must fit daily limits. An existing approved school SMTP relay is also suitable. Domain ownership is required; no domain price is assumed. [Resend pricing](https://resend.com/pricing).
5. Vercel remains Vite, root `lostfound-school`, `npm run build`, output `dist`, Node 24 via package engines, same-origin `/api`, existing safeguards and deployment protection. Hobby is restricted to personal non-commercial use; verify eligibility for actual school operation rather than assuming all school use qualifies. [Vercel Hobby](https://vercel.com/docs/plans/hobby).
6. Database backup and separate private-object backup/restore procedure. Supabase database backups contain Storage metadata, not image bytes. [Backup scope](https://supabase.com/docs/guides/platform/backups).

For self-hosting, official baseline is 2 CPU cores/4 GB RAM/40 GB SSD; recommended 4 cores/8+ GB/80+ GB. Use a supported Linux Docker/Compose host, persistent database and Storage volumes, TLS gateway, restricted administrative access, automated backups and monitoring. Expose required HTTPS APIs, not public database/Studio/metrics ports. Deploy the official compatible stack (Postgres, Auth, PostgREST, Storage, gateway and required dependencies), pin versions and replace every sample secret. A private filesystem Storage backend is adequate initially; S3 is optional. This stack cannot live on Vercel Functions' transient filesystem. [Official self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker).

## Necessary code changes

Managed Supabase: no Auth replacement, SQL redesign or Storage adapter rewrite is expected. Configure existing variables and apply the existing three migrations. One testing change is needed: `integration/workflow.test.ts` currently starts a local Express listener against live Supabase, without enabling the distributed limiter. It does not exercise deployed Vercel routing or shared quotas. Add a separate explicitly allowlisted Preview API target mode (with existing staging guards retained) and tests that exercise the distributed limiter. Keep the local integration mode. Update documentation and testing evidence later under separate publication approval.

Self-hosted Supabase: existing validators already accept HTTPS custom origins and legacy anon/service-role JWT keys, but `integration/support.ts` deliberately accepts only `<STAGING_PROJECT_REF>.supabase.co`. Add a separately reviewed exact staging-origin allowlist plus environment/project identity checks for self-hosting; preserve explicit opt-in and production refusal. Do not simply remove the guard. Validate the official stack's auth schema and key format against all migrations.

Neon or another non-Supabase backend: replace frontend auth integration and recovery/session flows; rewrite server authentication/profile lookup and Store adapter; map auth-user foreign keys and SQL identity helpers; preserve role assignment and RLS using a non-bypass application role and verified transaction-local identity; replace private upload/signing/attachment checks. Test direct database/storage access and all roles again. Keeping Supabase Auth alone would still require hosting Auth and supporting services, so a database-only swap does not remove the hosting problem.

## Implementation plan after explicit approval

1. Approve a budget and isolated resource scope. Recommended: one new Pro organization and one staging Micro project initially. Record allowed project ID/reference and explicitly exclude both Quest IDs. Obtain sender-domain access and confirm Vercel plan eligibility. Confirm school privacy/data-location requirements before real student onboarding.
2. Create the dedicated staging project, enable operator MFA, leave paid add-ons off, and record its region and cost estimate. Use Dashboard SQL Editor if the Windows CLI remains blocked; do not change Windows security settings.
3. On the empty staging database apply, in this exact order:
   - `supabase/migrations/20261110000000_school_mvp.sql`
   - `supabase/migrations/20261110010000_staging_hardening.sql`
   - `supabase/migrations/20261110020000_api_rate_limits.sql`
   Record applied versions; do not rerun successful non-idempotent migrations. Use a migration runner with recorded history when available; if SQL Editor is used, maintain an explicit execution ledger and reconcile history before later CLI use.
4. Run `supabase/staging/verify.sql`; require RLS on all six application/private tables, no anonymous write RPC, no client role update/direct item insert, private WebP bucket, correct counter privileges and no users missing profiles. Inspect all Storage policies for broad grants. Run Security Advisor and investigate findings before proceeding.
5. Enable email/password and email confirmation; disable anonymous sign-in. Configure custom SMTP and verified sender, strong password policy, provider Auth rate limits and exact Site URL/redirect URLs. Use the stable Preview branch origin with `/login` and `/reset-password`; no broad wildcard redirect. Preserve Vercel protection and verify email links in an authenticated tester browser.
6. Register four distinct controlled staging accounts: student A, student B, admin and outsider. Confirm their inboxes. Add only A/B/admin to `private.school_members` through a trusted operator. Assign the admin in `public.profiles` only after verifying the exact user ID. Keep outsider unallowlisted. No real student data in test fixtures.
7. Scope Vercel variables to Preview and only `codex/vercel-api-preview`. Public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL=/api`. Server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_STORAGE_SECRET_KEY`, `FRONTEND_ORIGIN` equal to the stable branch origin. Never use a VITE prefix for the privileged key. SMTP credentials belong in Supabase SMTP configuration, not frontend code. Do not pull production secrets or add test passwords to Vercel.
8. Populate ignored local `.env`/`.env.staging` securely; run `npm run check:env`. Set `APP_ENV=staging`, `RUN_STAGING_TESTS=yes`, exact `STAGING_PROJECT_REF` and four staging-only credentials only for opted-in live tests. Review the scripts before running, since they create test records. Implement the guarded hosted-target test mode described above; the existing workflow targets a local Express listener even when VITE_API_URL is configured. If Preview is inaccessible behind protection, use an approved authenticated test method without disabling it or weakening guards.
9. After separate push/deploy approval, rebuild Preview with configured public variables. Run `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:staging:register`, then `npm run test:staging`. Manually verify real confirmation/reset emails, session restoration/logout, outsider denial, student/admin separation, cross-owner access denial, item creation/moderation, Smart Match and full pending→approved→returned workflow. Recheck Storage signed URLs, expiration, sanitization, malformed/oversized images, non-owner upload denial, quotas, no-store headers and error redaction. Linux module loading alone does not prove a real upload.
10. Close remaining hosted verification gaps: protected HTTP status/headers, exact mobile widths, concurrent quota enforcement, upstream/request timeout behavior and representative catalog sizes. Use controlled staging data; no load tests against Quest. Add a regression test for each confirmed defect.
11. Before real launch, establish backup retention and demonstrate restoration of both SQL and image bytes. Prefer a second isolated production Micro project, apply the same migrations, and repeat production configuration with distinct credentials. Production deployment, merge and env changes require separate approval. Do not connect the current public frontend to staging automatically.
12. Approve rollout only after live acceptance and operational ownership are recorded. Keep rollback to the prior frontend available; reverting frontend code does not undo database writes. Disable staging test opt-in for production and never run destructive integration workflows there.

## Remaining blockers

Budget/resource-creation approval; no spare managed Free project slot; sender-domain/SMTP setup; Vercel Hobby eligibility for the eventual operator; live Supabase verification; backup ownership and privacy/region decisions. None requires touching Quest. Under the current no-new-resources/no-paid-services restriction, no hosted backend can be enabled during this assessment.
