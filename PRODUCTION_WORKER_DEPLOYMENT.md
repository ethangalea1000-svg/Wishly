# Wishly production API deployment

This branch isolates the Cloudflare Worker from the GitHub Pages demo and binds it only to the production D1 database.

## Safety boundaries

- Frontend remains on GitHub Pages: https://ethangalea1000-svg.github.io/Wishly/
- Worker name: `wishly-production-api`
- D1 binding `DB` points only to `wishly-production-db` (ID `3287b8ce-2e1d-4ce0-865d-77706ba49388`).
- Do not change the existing `wishly-api` demo Worker or `wishly-demo-db`.
- Do not merge this branch into `main`; the deployment configuration is intentionally separate.

## Before deployment

The current API implementation uses an HttpOnly session cookie named `__Host-wishly_session` with `SameSite=Lax`. The frontend is on `github.io` and the API will be on `workers.dev`, which are different sites. Browser third-party-cookie restrictions can prevent this cookie from being sent, so account sessions are not yet reliably compatible with the GitHub Pages architecture.

**Do not treat the API as production-ready until authentication is changed to a deliberate cross-origin strategy and the frontend is configured to call the API URL.** A custom API domain under a domain you control, or a reviewed bearer-token design, should be chosen before launch. Do not store session secrets or passwords in frontend code or Git.

## Configuration

The isolated config is `wrangler.worker.toml`. It defines:
- `main = "worker/src/index.ts"`
- `APP_ORIGIN = "https://ethangalea1000-svg.github.io"`
- D1 binding `DB` → `wishly-production-db`

Set the secret interactively in Cloudflare/Wrangler; never commit its value:

```sh
npx wrangler secret put SESSION_PEPPER --config wrangler.worker.toml
```

Deploy only after the cross-origin session strategy and frontend API base URL have been implemented and tested:

```sh
npx wrangler deploy --config wrangler.worker.toml
```

Health endpoint after deployment:

```
GET https://<deployed-worker-host>/api/health
```

The expected response is `{"status":"ok","service":"wishly-api"}`. A health response alone does not prove registration, login, or wishlist flows work.
