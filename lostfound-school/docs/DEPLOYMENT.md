# Deployment preparation — no deployment performed

The Git workspace contains `lostfound-school/`, root `render.yaml`, and root `.github/workflows/ci.yml`. Vercel's project root must be `lostfound-school`. If publishing only that subfolder as a new repository, move the workflow/Blueprint into the new root and remove their `lostfound-school` path prefixes.

For the current exact Dashboard workflow and live integration tests, follow [STAGING_SETUP.md](STAGING_SETUP.md).

## Configure an isolated Supabase project first

1. Use a dedicated development/staging project explicitly approved by its owner. Apply `supabase/migrations/20261110000000_school_mvp.sql` once to an empty project, then `supabase/migrations/20261110010000_staging_hardening.sql`. If the initial migration already succeeded, apply only the second migration. Do not run this against an existing school's database without migration review/backups. The migration expects Supabase's Auth and Storage schemas. No hosted project was selected or modified during development.
2. Enable email/password Auth, email confirmation, a minimum 12-character password policy and suitable Auth rate limits. Disable anonymous login. Set Site URL and allowed redirect URLs to the frontend origins and `/login` paths. Configure email delivery before inviting students.
3. Add verified school emails using a trusted database operator session:

```sql
insert into private.school_members(email) values ('student@your-school.example');
```

4. After the designated staff member registers, add their email to the allowlist and assign admin from a trusted operator session:

```sql
update public.profiles set role='admin'
where id=(select id from auth.users where email='staff@your-school.example');
```

Verify exactly the intended account changed. No registration form or client metadata grants admin rights. Removing an email from the allowlist revokes application access on subsequent requests. Signed image links already issued expire after ten minutes.

5. Use the project's publishable key for browser and API user-context operations. Put a secret/service-role key only in the backend `SUPABASE_STORAGE_SECRET_KEY`; it is used only for Storage writes. Never use a `VITE_` prefix for secrets or place them in Vercel frontend variables. Never paste secret values into source, logs or screenshots. Without this backend secret, uploads return a configuration error; other workflows remain available.
6. Run the live acceptance checklist in TESTING.md. Inspect Supabase security advisors and verify direct Data API/Storage denial paths.

## Local run

Node 24 LTS is required (native TypeScript execution in the API/test runner).

```powershell
cd lostfound-school
npm ci
Copy-Item .env.example .env
# Fill .env from your explicitly selected staging project.
npm run dev:api
# Second terminal, same directory:
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `127.0.0.1:3001`. For `127.0.0.1:5173` instead, change `FRONTEND_ORIGIN` accordingly. Authentication intentionally does not work before configuration/membership are present; the landing page shows normally.

The Supabase CLI 3.1.0 executable is blocked by this Windows host's application-control policy. It was not bypassed. The timestamped migration was prepared manually and executed in embedded PostgreSQL tests. On an approved machine, inspect the installed CLI's help before using migration commands; applying the SQL via the staging SQL editor is also possible. Docker Desktop's Linux engine was unavailable, so a full local Supabase stack was not started.

## Render API

Review root `render.yaml` before creating/syncing a Blueprint. It starts `npm start` on Node 24, binds Render's `PORT` on `0.0.0.0`, and checks `/api/health`. Populate the Supabase URL, publishable key, Storage secret, and exact frontend origin in Render. Confirm proxy topology before relying on `TRUST_PROXY_HOPS=1`. Auto-deploy is off. Choose the service plan/region with the owner; the template does not establish cost approval. Health endpoint checks process availability, not database readiness; verify `/api/me` and a data operation after configuration.

## Vercel frontend

Import only after explicit authorization. Root directory: `lostfound-school`; framework: Vite; install: `npm ci`; build: `npm run build`; output: `dist`. Configure Node 24. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL=https://YOUR-API.onrender.com/api`. These are build-time variables; rebuild after changes. SPA rewrites in `vercel.json` support direct nested-route navigation. API requests use the explicit Render URL in production; do not leave `VITE_API_URL=/api` there.

## GitHub and release

The root CI workflow installs dependencies, runs tests/typecheck/build and Chrome browser tests. It does not deploy. Lockfile and `.gitignore` are supplied. Review changes and check for secrets before the first commit/push. No remote, push, PR or deployment has been created by this task. Keep separate Supabase projects/keys for staging and production; verify backup/retention policy and school onboarding responsibilities before real use.

Reference configuration: [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Vercel project configuration](https://vercel.com/docs/project-configuration).
