import api from "../../worker/src/index";

interface Env {
  DB: D1Database;
  APP_ORIGIN: string;
  SESSION_PEPPER: string;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => api.fetch(request, env);