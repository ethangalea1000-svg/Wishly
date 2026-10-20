# Wishly production — initial security review

This is a preliminary engineering checklist, not a certification or penetration test.

## In place in the initial branch
- SQL uses prepared statements for user-supplied values.
- Passwords are never stored in plaintext; a random per-user salt and PBKDF2-SHA-256 are used through Web Crypto.
- Session tokens are random, sent only as HttpOnly/Secure/SameSite cookies, and only a hash of the token is stored in D1.
- API routes that read private lists require a valid server-side session and check list ownership.
- Mutating requests reject a supplied Origin that does not exactly match APP_ORIGIN.
- Initial login/register rate limiting is backed by D1.
- Response headers include nosniff, frame denial, referrer policy, and restrictive permissions policy.
- The public API never exposes an admin-role mutation.

## Release blockers
1. Add automated unit/integration tests for signup, login, logout, expiry, account isolation, invalid input, rate limits, and SQL migration.
2. Complete a CSRF threat model and test browser cookie behavior in the actual hosting topology.
3. Serve the frontend and API from the same origin or a verified same-site setup. Do not assume cross-site cookies from a GitHub Pages origin to a workers.dev API will work reliably.
4. Add email verification, password reset with single-use expiring tokens, and account deletion/export flows.
5. Add an explicit account/session revocation UI and scheduled cleanup for expired sessions/rate-limit rows.
6. Add strict response security headers including a tested CSP at the frontend; the API cannot secure the HTML pages by itself.
7. Validate public item image URLs and prevent tracking/privacy leaks; if server-side URL fetching is added, implement SSRF protections and block private/reserved IP ranges and redirects to them.
8. Review error paths and status codes for account enumeration; consider a stable generic response policy.
9. Benchmark PBKDF2 parameters on the deployed runtime and document migration strategy. Do not claim Argon2id unless implemented.
10. Add audit log writes for privileged actions before implementing administration.
11. Test migrations on a fresh disposable D1 database and verify backup restoration before any real data is introduced.
12. Perform independent security and privacy review before public launch.

## Data safety
- Never point this worker at the demo database.
- Never commit SESSION_PEPPER, OAuth secrets, SMTP credentials, payment keys, or tokens.
- The admin role must be granted only through a controlled operator process, never via public registration.
- Do not log passwords, session cookies, guest contact details, or full private list content.
- The starter schema includes reservations, but the guest reservation API is not implemented yet.