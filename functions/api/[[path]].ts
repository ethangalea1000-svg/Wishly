// Proxy /api/* vers le worker wishly-production-api via service binding (Production).
// Le worker garde D1 et SESSION_PEPPER : aucun secret duplique cote Pages.
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => env.API.fetch(request);
