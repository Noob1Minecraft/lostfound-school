# Connect the school MVP

Use the existing Vercel project and **one independent Free Neon project** for Auth, PostgreSQL and private object storage. No Render, separate Express host, AI service, payments, second database project or Docker is needed. The app remains unavailable for real login until this setup is completed. None of these cloud actions has been performed.

## 1. Create the one free database project after approval

Choose Neon Free in a region supporting Auth and Object Storage (Singapore or Frankfurt are documented options). Do not attach billing or modify Engineerus Quest. Verify provider availability in the account before proceeding. Free currently includes 100 CU-hours/month, 1 GB PostgreSQL and 5 GB object storage per project; 5 GB monthly transfer exhaustion can suspend service. This is suitable for a small assessment, not an unlimited service. [Pricing](https://neon.com/pricing), [storage regions](https://neon.com/docs/storage/overview).

In the new project's empty database, run **only `neon/migrations/001_school.sql`**, once, as the migration owner. It creates the one-school schema, restricted roles, RLS and business functions atomically. Do not apply the Supabase migrations to Neon. Then run `neon/verify.sql`; inspect all permission/RLS checks.

Create the dedicated runtime login privately in SQL Editor; replace placeholders without committing the filled SQL:

```sql
CREATE ROLE school_runtime LOGIN PASSWORD '<unique-generated-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT school_app, school_identity TO school_runtime;
GRANT CONNECT ON DATABASE "<database-name>" TO school_runtime;
```

Use that role's pooled connection string with **`sslmode=verify-full`**. Do not use the database-owner connection in Vercel. If restricted-role creation is unavailable, stop rather than weakening permissions.

## 2. Enable managed Auth and school access

Enable email/password Auth, require email verification, enable reset-session revocation and provider abuse controls where supported. Set the exact HTTPS application origin as trusted; allow login and reset redirects to `/login` and `/reset-password`. Confirm real email delivery; the application does not send mail or store passwords itself. Obtain the branch's managed Auth base URL, including its path.

Bootstrap the intended administrator using the owner connection:

```sql
INSERT INTO private.school_members(email,active)
VALUES (lower('<verified-admin-email>'),true);
```

After configuring Vercel below, that person registers, verifies email and signs in once. This creates a **student** profile. Inspect it before promoting exactly that intended account:

```sql
SELECT p.id,p.role FROM public.profiles p
JOIN private.identities i ON i.user_id=p.id
WHERE i.email=lower('<verified-admin-email>');

UPDATE public.profiles p SET role='admin'
FROM private.identities i
WHERE i.user_id=p.id AND i.email=lower('<verified-admin-email>')
RETURNING p.id,p.role;
```

Log in again. The admin can now open **Школьный доступ** to admit classmates by email. Registration alone does not grant access to school records; students must verify email and be admitted. Signup cannot choose an admin role. Keep the last active administrator.

## 3. Private photos in the same project

Create a private `item-images` bucket. Obtain the branch S3 endpoint, region and scoped `storage:read`/`storage:write` credentials; never use an account-wide management key. The adapter already uses path-style S3, JPEG/PNG/WebP validation, 4 MB maximum uploads, Sharp WebP conversion and ten-minute signed reads. Confirm unsigned access is denied. No separate storage service is needed. [Neon credentials](https://neon.com/docs/storage/authentication).

## 4. Set Vercel variables privately

Keep the current project/root `lostfound-school`, Vite, `npm run build`, output `dist`, Node 24 and existing `/api`/SPA rewrites. Use `.env.example` as the complete variable list:

| Variable | Value |
|---|---|
| `VITE_AUTH_PROVIDER` | `neon` |
| `VITE_API_URL` | `/api` |
| `BACKEND_PROVIDER` | `neon` |
| `FRONTEND_ORIGIN` | Exact HTTPS origin, no trailing slash |
| `DATABASE_URL` | Restricted `school_runtime` URL, `sslmode=verify-full` |
| `NEON_AUTH_URL` | Managed Auth base URL |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Branch endpoint, region, `item-images` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Scoped private storage credentials |

Only the two `VITE_` settings belong in the browser. Leave Supabase variables unset for this setup. Never paste secrets into Git, logs, screenshots or chat. Configuration validation checks shape, not actual credentials or connectivity.

## 5. Final deployment checklist

- [ ] Keep changes local until publication is explicitly approved. For CI-only publishing, first verify Vercel branch deployment exclusion; connector access to this project is currently unresolved. Never assume an ordinary branch push is deployment-free.
- [ ] Run the existing Ubuntu workflow: locked install, 63 automated tests, TypeScript/build, and both browser suites. Resolve real failures. Windows Rollup is blocked by Application Control; do not disable or bypass it. Linux CI has not yet validated these changes.
- [ ] Authorize a Preview on the **same Vercel project**, using the one Neon project with synthetic assessment accounts/data. Set Preview's exact origin in Vercel and Auth. No second database project is required. Preview and production must not share real student data during testing.
- [ ] Test actual registration, email verification, login/logout, reload, edits, filters and images. Student A posts Lost; B posts Found; staff approves both; deterministic matching appears; A claims; staff verifies and confirms return; a new login still shows returned status.
- [ ] Test outsider access, student-to-admin attempts, other-owner edits, invalid uploads, private claim evidence, reset-password flow, mobile layout, assets, deep links and browser console. Check the real provider cookie/redirect contract and database permissions.
- [ ] Only after those checks pass, obtain production approval. Reuse this database project for the assessment, set the production origin `https://lostfound-school.vercel.app`, configure the production variables and appropriate Auth redirect, and release the reviewed commit. Remove Preview's access to real data before admitting real pupils. Retain the previous frontend deployment for rollback.

Vercel Hobby is restricted to personal, non-commercial use; confirm this assessment's eligibility. No paid fallback is authorized. [Hobby terms](https://vercel.com/docs/plans/hobby).

**Release gate:** until the complete real workflow passes, call this a locally implemented MVP, not a fully working production application.
