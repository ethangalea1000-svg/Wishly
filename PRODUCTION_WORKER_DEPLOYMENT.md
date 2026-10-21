# Wishly production API deployment

This branch isolates the Cloudflare Worker from the GitHub Pages demo and binds it only to the production D1 database.

## Safety boundaries

- Frontend remains on GitHub Pages: https://ethangalea1000-svg.github.io/Wishly/
- Worker name: `wishly-production-api`
- D1 binding `DB` points only to `wishly-production-db` (ID `3287b8ce-2e1d-4ce0-865d-77706ba49388`).
- Do not change the existing `wishly-api` demo Worker or `wishly-demo-db`.
- Do not merge this branch into `main`; the deployment configuration is intentionally separate.

## Before deployment

The API and frontend have been adapted for cross-origin calls: the Worker accepts a bearer session token in the `Authorization` header, CORS permits that header, and the static frontend stores the token in `sessionStorage` (cleared when the tab session ends or the user logs out). This avoids dependence on third-party cookies. A bearer token is still sensitive: never log it or expose it in URLs. Because JavaScript can read `sessionStorage`, prevent XSS and keep all output safely escaped.

The frontend API base URL is currently set to `https://wishly-production-api.ethan-galea1000.workers.dev` in `production/app.js` and `production/shared.js`. Confirm that hostname after deployment; if Cloudflare assigns a different workers.dev hostname, update both files before publishing the frontend.

## Configuration

The isolated config is `wrangler.worker.toml`. It defines:
- `main = "worker/src/index.ts"`
- `APP_ORIGIN = "https://ethangalea1000-svg.github.io"`
- D1 binding `DB` → `wishly-production-db`

Set the secret interactively in Cloudflare/Wrangler; never commit its value:

```sh
npx wrangler secret put SESSION_PEPPER --config wrangler.worker.toml
```

Before deployment, set a random secret of at least 32 characters. Deploy the isolated Worker, then verify the health endpoint, registration, login, logout, list creation, gift creation, sharing and guest reservations. Do not announce production readiness until these checks pass:

```sh
npx wrangler deploy --config wrangler.worker.toml
```

Health endpoint after deployment:

```
GET https://<deployed-worker-host>/api/health
```

The expected response is `{"status":"ok","service":"wishly-api"}`. A health response alone does not prove registration, login, or wishlist flows work.

## Windows PowerShell deployment steps

Run these commands from the repository root on your own PC. They deploy only the Worker described by `wrangler.worker.toml`; they do not publish the GitHub Pages frontend or run database migrations.

1. Authenticate Wrangler to your Cloudflare account:

   ```powershell
   npx wrangler login
   ```

2. Generate a private random secret locally. Do not paste it into ChatGPT, GitHub, an issue, or a commit:

   ```powershell
   $pepper = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   $pepper
   ```

3. Start the secret prompt:

   ```powershell
   npx wrangler secret put SESSION_PEPPER --config wrangler.worker.toml
   ```

   Paste the value printed by PowerShell into Wrangler's secret prompt. After Wrangler confirms it, clear the local variable:

   ```powershell
   Remove-Variable pepper
   ```

4. Deploy the isolated Worker:

   ```powershell
   npx wrangler deploy --config wrangler.worker.toml
   ```

5. Copy the exact `workers.dev` URL reported by Wrangler and test:

   ```powershell
   Invoke-RestMethod "https://<exact-worker-host>/api/health"
   ```

   Expected JSON: `status = ok`, `service = wishly-api`. Do not guess the hostname; if it differs from the frontend's configured URL, update both `production/app.js` and `production/shared.js` before publishing the frontend.

A successful health check is only the first gate. Test registration/login/logout, list and gift CRUD, sharing, guest reservation/cancellation, and account export/deletion before publishing `wishly-app/`. Do not rerun the already-applied D1 migrations.
