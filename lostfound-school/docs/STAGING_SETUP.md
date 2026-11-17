# Supabase staging: exact operator checklist

Updated 2026-11-10. No Supabase project was created, changed or deployed by this task. Use a **new, dedicated staging project**, never production. The current workspace contains examples only, no configured `.env`. The live tests are prepared but have not run against hosted Supabase.

## 1. Create/select staging in Supabase Dashboard

Create a new project named, for example, `lostfound-school-staging`, in your intended organization. Select the plan/region and set the database password yourself; store it in your password manager. The app does not need the database password. Wait until the project is ready. Record the project reference shown in the project URL/settings. Keep production and staging project references visibly distinct.

Open **Project Settings → API Keys** and the project's **Connect / Data API** settings. Copy the project URL and **publishable** key into a local file, not this chat. If you only see legacy keys, the frontend key must be `anon`, never `service_role`. A separate backend-only secret key (or legacy service-role key) is needed for image uploads. Do not put it in any `VITE_*` variable. [API key reference](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Apply these three migrations, in order

Use **SQL Editor → New query**, running as the default `postgres` operator. Review the selected project before every run.

1. `supabase/migrations/20261110000000_school_mvp.sql` — initial profiles/items/matches/claims tables, constraints, roles, Auth trigger, RLS, mutation RPC functions, private image bucket and Storage read policies. For a fresh project, paste the **entire** file between `BEGIN;` and `COMMIT;` and run it once. Do not select/run isolated fragments. Do not rerun it if it already succeeded.
2. `supabase/migrations/20261110010000_staging_hardening.sql` — backfills profiles for previously created Auth users as students, enables RLS on the private membership table, denies banned/deleted/anonymous users through direct database access, removes client Storage deletion, restricts the bucket to sanitized WebP, and reloads the API schema cache. This file already contains `BEGIN`/`COMMIT`; run the entire file as-is.

3. `supabase/migrations/20261110020000_api_rate_limits.sql` — private per-user counters and fixed-quota rate-limit RPC required by the API. Run the complete file once after migration 2.

If a migration was already applied successfully, do not reapply it: run only the missing later migrations in order. They preserve existing roles and data. Do not edit/reapply migration 1 to upgrade. If the initial migration failed partway through before using a transaction, stop and inspect the staging schema instead of blindly rerunning or dropping tables.

Dashboard SQL Editor execution does not maintain the CLI migration-history table. Keep a record of filenames applied. Do not subsequently `db push` these same files without reconciling history through the supported CLI migration-repair workflow on an approved machine. The installed CLI binary was previously blocked by this Windows host's application-control policy; no attempt was made to bypass it. This is why the additive migration was authored locally and tested with embedded PostgreSQL.

Then run **`supabase/staging/verify.sql`** in a new query. It is read-only. Check:

- All six application tables listed have RLS enabled.
- `users_without_profile` is zero.
- The final limiter checks are `true, false, false, true`; `private` remains unexposed.
- All three direct privilege checks are false.
- `item-images` is private, 5,242,880 bytes, allowed MIME `image/webp`.
- Review **all** Storage policies. No broad policy from another app should grant INSERT/UPDATE/DELETE for this bucket. PostgreSQL permissive policies combine with OR; a separate broad policy would defeat these restrictions. Use a dedicated project rather than sharing another app's policies.

Open **Data API settings**: leave `public` exposed/enabled; **do not expose `private`**. The migrations explicitly grant the needed SELECT and RPC privileges to `authenticated`. Do not add general table write privileges or new public policies to fix an error. Check **Security Advisor** and review findings before continuing.

## 3. Configure Auth and real email delivery

In **Authentication → Sign In / Providers** (labels may vary by Dashboard version):

- Enable Email/password sign-in and new signups for the staging registration test.
- Enable **Confirm email**; do not disable confirmation to make tests pass.
- Disable anonymous sign-ins.
- Set password minimum length to at least 12 characters. Keep reasonable Auth rate limits.

In **Authentication → URL Configuration**:

- Site URL: `http://localhost:5173`
- Redirect allowlist: `http://localhost:5173/login`
- If using `127.0.0.1` instead, add `http://127.0.0.1:5173/login` and change the app/API origin consistently. Avoid broad wildcard redirects.

In **Authentication → Email / SMTP Settings**, configure your SMTP provider and verified sender. Supabase's default sender restricts recipients to project-team addresses and has a low send limit, so four independent test inboxes normally require custom SMTP. Keep the confirmation email template's confirmation link intact. [SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 4. Configure local environment (outside Dashboard)

From the `lostfound-school` directory, copy `.env.example` to `.env`. Never commit it. Use:

| Variable | Value/source |
|---|---|
| `VITE_SUPABASE_URL` | Staging project URL, `https://<ref>.supabase.co` |
| `SUPABASE_URL` | Exactly the same URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Staging publishable key (legacy anon accepted) |
| `SUPABASE_PUBLISHABLE_KEY` | Exactly the same public key |
| `SUPABASE_STORAGE_SECRET_KEY` | Staging server-only secret/service-role key; never browser-visible |
| `VITE_API_URL` | `/api` for the local Vite proxy |
| `FRONTEND_ORIGIN` | `http://localhost:5173` |
| `PORT` | `3001` (Vite's proxy expects this port) |
| `TRUST_PROXY_HOPS` | `0` locally |

Run `npm run check:env`. It prints only field names/errors, never values. It checks key classes, URL safety, matching frontend/backend project values and numeric settings. It does **not** authenticate keys or establish that the selected project is truly staging. Vite startup/build rejects privileged browser values; API startup validates server configuration. Use `.env` for this setup; avoid conflicting `.env.local`/mode-specific overrides. Restart both servers after changes.

Copy `.env.staging.example` to `.env.staging`. Fill four **distinct, controlled inboxes** and unique staging passwords (≥12 characters): student A, student B, administrator and outsider. Set `STAGING_PROJECT_REF` to this staging project's reference. Keep `APP_ENV=staging`; change `RUN_STAGING_TESTS` to `yes` only after checking the project reference yourself. Flags cannot determine whether an operator has accidentally selected a production project.

## 5. Register and confirm test users

Run `npm run test:staging:register`. This calls the real public signup API for all four users and expects confirmation to be required. The test deliberately supplies `user_metadata.role=admin`; the database must still create **student** profiles. It does not use Auth Admin creation, bypass email confirmation or assign roles.

Open all four inboxes and click their confirmation links. You can start `npm run dev` so the redirect target is available. In **Authentication → Users**, verify that all four accounts exist and have confirmed email. An accepted signup request for an existing account can be obfuscated by Supabase, so inspect the actual accounts rather than treating an accepted response as proof of new registration. For repeat registration testing use fresh controlled inboxes; do not repeatedly send confirmation emails to real students.

## 6. Allowlist the school users and promote only the staff test account

In staging **SQL Editor**, replace the placeholders with the exact lowercased emails used in `.env.staging` and run:

```sql
insert into private.school_members(email) values
  ('YOUR_STUDENT_A_EMAIL'),
  ('YOUR_STUDENT_B_EMAIL'),
  ('YOUR_ADMIN_EMAIL')
on conflict(email) do nothing;
```

The uppercase placeholders intentionally fail the normalization constraint if left unchanged. **Do not allowlist the outsider.** Confirmation and school membership are separate: a verified outsider must still receive 403 from `/api/me` and zero school rows through direct REST.

After verifying the administrator email in Auth → Users, promote that one account:

```sql
update public.profiles p set role='admin'
from auth.users u
where p.id=u.id
  and lower(u.email)='YOUR_ADMIN_EMAIL'
  and u.email_confirmed_at is not null
returning p.id,p.display_name,p.role;
```

Replace the placeholder with the real lowercase admin test email. The result must be **exactly one row**. Check students remain students:

```sql
select u.email,p.role,u.email_confirmed_at
from auth.users u join public.profiles p on p.id=u.id
where lower(u.email) in ('YOUR_STUDENT_A_EMAIL','YOUR_STUDENT_B_EMAIL','YOUR_ADMIN_EMAIL','YOUR_OUTSIDER_EMAIL');
```

Do not share this account query's output publicly. Never promote through editable registration metadata.

## 7. Run the real staging integration workflow

Run `npm run test:staging`. It starts its own temporary localhost Express server connected to the explicitly configured Supabase project. No deployed API is required. The suite performs real password logins, verifies roles/outsider denial, creates Lost and Found listings, rejects unauthorized edits/direct uploads, uploads a PNG through the API, downloads sanitized private WebP, moderates listings, checks explained/persisted Smart Match, creates private evidence, approves the claim and confirms a **synthetic** return. It checks both listings become returned. This test writes staging rows and Storage objects; it never applies migrations or changes roles.

The suite leaves synthetic records for Dashboard inspection. Each run uses a unique title marker. It deliberately does not delete accounts or perform broad cleanup. Use a dedicated staging project and manually inspect/remove only test artifacts if needed. The test attempts to sign out its clients during cleanup; access-token revocation is not assumed instantaneous. Separate-browser email confirmation and visual interaction remain manual checks.

For normal UI verification start `npm run dev:api` and `npm run dev`, visit `http://localhost:5173`, and log in with the test accounts. Perform the same flow across separate browser profiles. In Dashboard inspect items, claims, matches, Auth logs and the private Storage bucket. Run Security Advisor again.

## Known remaining acceptance checks

The prepared live suites have not been executed here because credentials/project configuration are absent. Verify actual SMTP delivery, private signed-link expiry (ten minutes), simultaneous competing returns on separate database connections, and the project's actual security-advisor findings. Do not treat local PGlite or mocked browser tests as hosted Supabase evidence. No deployment is part of this stage.
