# Managed Neon Auth boundary

This application does not implement password storage, signing, or email delivery. `NEON_AUTH_URL` is the branch's managed Better Auth base URL, including its base path. `FRONTEND_ORIGIN` is the exact HTTPS application origin, with no trailing slash. Mount `createNeonAuthRouter` at `/api/auth` before application authentication. Only the explicitly enumerated operations exist; admin, organization, OAuth, JWT/token and arbitrary proxy routes are unavailable.

## Browser contract

All POST requests require `Content-Type: application/json`, an exact matching `Origin`, and at most 16 KiB. Unknown body properties are rejected (including `role`, IDs and verification flags). Use same-origin credentials. Registration and replacement passwords require 12–128 characters; login accepts existing 1–128 character credentials for provider verification.

| Route | Body/result |
| --- | --- |
| GET get-session | `{user:{id,email,name},expiresAt}` or `null`; only verified, unbanned, unexpired sessions |
| POST sign-in/email | `{email,password,rememberMe?,callbackURL?}` |
| POST sign-up/email | `{email,password,name,callbackURL?}` |
| POST sign-out | `{}` |
| POST request-password-reset | `{email,redirectTo?}` |
| POST reset-password | `{token,newPassword}` |
| POST send-verification-email | `{email,callbackURL?}` |
| GET verify-email | Only `token` and optional `callbackURL` query parameters |

POST success returns `{ok:true}`; reload `get-session` afterward. No provider response tokens, roles, session internals or raw error messages reach JavaScript. Errors are `{error}` with a generic localized message; unverified-email errors additionally carry `code: "EMAIL_NOT_VERIFIED"`. Transport/server failures return 503. Reset request success is intentionally generic. The provider must also enable enumeration protection.

Callbacks must equal `FRONTEND_ORIGIN + '/login'`; reset redirects must equal `FRONTEND_ORIGIN + '/reset-password'`. Defaults use those same paths. No caller-supplied query, hash, alternate path or external origin is accepted. Better Auth's email reset flow appends `token` or `error` to the approved reset URL. Verification redirects are processed manually and must land on the local login page; only a fixed failure query survives. Passwords are forwarded in memory over HTTPS and never persisted or logged by this module. Infrastructure must not log request bodies or verification query strings.

## Session trust

Only the documented `__Secure-neon-auth.session_token` cookie is forwarded. Cached identity cookies, arbitrary cookies and client Authorization headers are discarded. Cookies emitted by the provider are filtered to that exact name, stripped of Domain and rewritten `Path=/api; HttpOnly; Secure; SameSite=Lax`, preserving valid expiry/deletion attributes. This is an intentional same-origin HTTPS deployment, not a cross-origin SDK integration. Duplicate session cookies fail closed.

Every business request calls managed `get-session?disableCookieCache=true`; no local session cache is trusted. Pass the Express response to `verifyNeonSession(req, options, res)` so provider session renewal cookies reach the browser during ordinary API use. The returned identity requires `emailVerified: true`, a nonexpired `session.expiresAt`, and no active banned flag. Provider role fields are discarded; school roles belong to the application's membership database. The provider must enforce revocation and account suspension on this endpoint. Fetches use a fixed configured base, manually handled redirects and an eight-second abort signal, combined with the enclosing request's cancellation via `boundedFetch`. Provider JSON reads are bounded to 64 KiB.

## Sources checked 2026-11-11

- [Neon authentication flow](https://github.com/neondatabase/website/blob/main/content/docs/auth/authentication-flow.md): managed session cookie name and opaque cookie semantics.
- [Official Neon proxy source](https://github.com/neondatabase/neon-js/blob/main/packages/auth/src/server/proxy/request.ts): base URL/path composition, Origin and `x-neon-auth-middleware` request header.
- [Official Neon cookie source](https://github.com/neondatabase/neon-js/blob/main/packages/auth/src/server/utils/cookies.ts): provider cookie extraction, expiry/deletion and serialization.
- [Better Auth email/password API](https://better-auth.com/docs/authentication/email-password): endpoint methods, payloads, email verification and reset callbacks.
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management): session fields and `disableCookieCache` live verification.

## Hosted verification gates (not completed locally)

No managed host or real email service has been provisioned or contacted by the tests. Confirm the specific branch's current provider version emits the documented cookie and ISO `expiresAt` response and accepts the proxy header, exact trusted frontend origin and server-side cookie forwarding. Unknown cookie names fail closed; do not silently broaden the allowlist. Configure email/password sign-up, verification-required login, verification/reset delivery, trusted callback origin and password-reset session revocation in the managed provider where supported. If a managed setting cannot be configured, document the limitation before release.

Run preview tests with synthetic accounts: registration and actual email delivery; verification link arriving at local login; verified login; refresh; revocation and banned-user rejection; logout cookie deletion; reset email link reaching `/reset-password?token=...`; password replacement and replay rejection. Provider-hosted email links may point to the provider first; this is valid only if its verified redirect reaches the approved application path. Confirm email delivery and redirect behavior against the actual managed host before treating this implementation as release-ready. Secure cookies require HTTPS, including local end-to-end preview. Local tests inject fetch only within test files and cannot substitute for those hosted gates.
