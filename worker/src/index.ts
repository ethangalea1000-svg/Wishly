interface Env {
  DB: D1Database;
  APP_ORIGIN: string;
  SESSION_PEPPER: string;
}
interface UserRow {
  id: string; email: string; display_name: string; password_hash: string;
  password_salt: string; password_iterations: number; role: string;
  email_verified_at: string | null; created_at: string;
}
interface SessionUser { id: string; email: string; display_name: string; role: string }
const SESSION_COOKIE = "__Host-wishly_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const PBKDF2_ITERATIONS = 310000;
const encoder = new TextEncoder();

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Vary", "Origin");
  return new Response(JSON.stringify(data), { status, headers });
}
function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}
function randomId(): string {
  return crypto.randomUUID();
}
function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function derivePassword(password: string, saltHex: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(x => parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(bits);
}
function parseCookies(request: Request): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return map;
}
function cookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === env.APP_ORIGIN;
}
async function rateLimit(request: Request, env: Env, bucket: string, max = 12): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(`${env.SESSION_PEPPER}:${bucket}:${ip}`);
  const now = Math.floor(Date.now() / 60000);
  await env.DB.prepare(
    "INSERT INTO rate_limits(bucket_key,count,window_started_at) VALUES(?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN window_started_at=? THEN count+1 ELSE 1 END, window_started_at=?"
  ).bind(key, now, now, now).run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket_key=?").bind(key).first<{count:number}>();
  return (row?.count ?? 0) <= max;
}
async function getUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(`${env.SESSION_PEPPER}:${token}`);
  const row = await env.DB.prepare(
    "SELECT u.id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.deleted_at IS NULL"
  ).bind(tokenHash, new Date().toISOString()).first<SessionUser>();
  if (row) await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?")
    .bind(new Date().toISOString(), tokenHash).run();
  return row ?? null;
}
async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().includes("application/json")) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}
async function createSession(userId: string, env: Env): Promise<{token:string; expires:string}> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_MS).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)")
    .bind(randomId(), userId, await sha256(`${env.SESSION_PEPPER}:${token}`), expires).run();
  return { token, expires };
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": env.APP_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    }});
  }
  const headers = new Headers();
  if (request.headers.get("Origin")) {
    if (!originAllowed(request, env)) return fail("Origine non autorisée.", 403);
    headers.set("Access-Control-Allow-Origin", env.APP_ORIGIN);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (!url.pathname.startsWith("/api/")) return fail("Route introuvable.", 404);
  if (request.method !== "GET" && request.method !== "HEAD" && !originAllowed(request, env)) return fail("Origine non autorisée.", 403);

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ status: "ok", service: "wishly-api" }, 200, headers);
    } catch { return fail("Service temporairement indisponible.", 503); }
  }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    if (!(await rateLimit(request, env, "register", 5))) return fail("Trop de tentatives. Réessaie plus tard.", 429);
    const body = await bodyJson(request);
    if (!body) return fail("Corps JSON invalide.");
    const email = cleanText(body.email, 254)?.toLowerCase();
    const displayName = cleanText(body.displayName, 60);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Adresse e-mail invalide.");
    if (!displayName || /[<>]/.test(displayName)) return fail("Nom affiché invalide.");
    if (password.length < 12 || password.length > 128) return fail("Le mot de passe doit contenir entre 12 et 128 caractères.");
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
    if (existing) return fail("Impossible de créer ce compte avec ces informations.", 409);
    const salt = randomToken(16);
    const hash = await derivePassword(password, salt);
    const id = randomId();
    try {
      await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,password_salt,password_iterations) VALUES(?,?,?,?,?,?)")
        .bind(id, email, displayName, hash, salt, PBKDF2_ITERATIONS).run();
      const session = await createSession(id, env);
      headers.append("Set-Cookie", cookie(session.token, Math.floor(SESSION_MS / 1000)));
      return json({ user: { id, email, displayName, role: "user" } }, 201, headers);
    } catch {
      return fail("Impossible de créer le compte pour le moment.", 503);
    }
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    if (!(await rateLimit(request, env, "login", 8))) return fail("Trop de tentatives. Réessaie plus tard.", 429);
    const body = await bodyJson(request);
    const email = cleanText(body?.email, 254)?.toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || password.length === 0 || password.length > 128) return fail("E-mail ou mot de passe incorrect.", 401);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE AND deleted_at IS NULL")
      .bind(email).first<UserRow>();
    if (!user) return fail("E-mail ou mot de passe incorrect.", 401);
    const calculated = await derivePassword(password, user.password_salt, user.password_iterations);
    if (calculated !== user.password_hash) return fail("E-mail ou mot de passe incorrect.", 401);
    const session = await createSession(user.id, env);
    headers.append("Set-Cookie", cookie(session.token, Math.floor(SESSION_MS / 1000)));
    return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } }, 200, headers);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request).get(SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(`${env.SESSION_PEPPER}:${token}`)).run();
    headers.append("Set-Cookie", clearCookie());
    return json({ ok: true }, 200, headers);
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await getUser(request, env);
    if (!user) return fail("Authentification requise.", 401);
    return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } }, 200, headers);
  }

  const user = await getUser(request, env);
  if (!user) return fail("Authentification requise.", 401);

  if (url.pathname === "/api/lists" && request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT id,title,description,visibility,occasion,event_date,currency,archived_at,created_at,updated_at FROM wishlists WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100"
    ).bind(user.id).all();
    return json({ lists: result.results }, 200, headers);
  }

  if (url.pathname === "/api/lists" && request.method === "POST") {
    const body = await bodyJson(request);
    const title = cleanText(body?.title, 100);
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const visibility = body?.visibility === "public" || body?.visibility === "unlisted" ? body.visibility : "private";
    if (!title || /[<>]/.test(title)) return fail("Titre invalide.");
    const id = randomId();
    await env.DB.prepare("INSERT INTO wishlists(id,owner_id,title,description,visibility) VALUES(?,?,?,?,?)")
      .bind(id, user.id, title, description, visibility).run();
    return json({ list: { id, title, description, visibility } }, 201, headers);
  }

  const listMatch = url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})$/i);
  if (listMatch && request.method === "GET") {
    const list = await env.DB.prepare(
      "SELECT id,title,description,visibility,occasion,event_date,currency,archived_at,created_at,updated_at FROM wishlists WHERE id=? AND owner_id=?"
    ).bind(listMatch[1], user.id).first();
    if (!list) return fail("Liste introuvable.", 404);
    const items = await env.DB.prepare(
      "SELECT id,title,url,image_url,description,category,price_minor,currency,quantity,priority,status,created_at,updated_at FROM wishlist_items WHERE wishlist_id=? ORDER BY created_at DESC LIMIT 200"
    ).bind(listMatch[1]).all();
    return json({ list, items: items.results }, 200, headers);
  }

  const itemCollection = url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})\/items$/i);
  if (itemCollection && request.method === "POST") {
    const listId = itemCollection[1];
    const owned = await env.DB.prepare("SELECT id FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listId, user.id).first();
    if (!owned) return fail("Liste introuvable.", 404);
    const body = await bodyJson(request);
    const title = cleanText(body?.title, 160);
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const category = cleanText(body?.category, 80);
    const urlValue = cleanText(body?.url, 2048);
    if (!title || /[<>]/.test(title)) return fail("Titre de cadeau invalide.");
    if (urlValue) {
      try {
        const parsed = new URL(urlValue);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fail("Seules les URL HTTP(S) sont autorisées.");
        if (parsed.username || parsed.password) return fail("URL invalide.");
      } catch { return fail("URL invalide."); }
    }
    const quantity = Number.isInteger(body?.quantity) ? Number(body?.quantity) : 1;
    const priority = Number.isInteger(body?.priority) ? Number(body?.priority) : 2;
    const priceMinor = body?.priceMinor == null ? null : Number(body.priceMinor);
    if (quantity < 1 || quantity > 99 || priority < 1 || priority > 3) return fail("Quantité ou priorité invalide.");
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > 100000000)) return fail("Prix invalide.");
    const id = randomId();
    await env.DB.prepare(
      "INSERT INTO wishlist_items(id,wishlist_id,title,url,description,category,price_minor,quantity,priority) VALUES(?,?,?,?,?,?,?,?,?)"
    ).bind(id, listId, title, urlValue, description, category, priceMinor, quantity, priority).run();
    return json({ item: { id, wishlistId: listId, title, url: urlValue, description, category, priceMinor, quantity, priority, status: "wanted" } }, 201, headers);
  }

  return fail("Route introuvable.", 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!env.SESSION_PEPPER || env.SESSION_PEPPER.length < 32 ||
          !env.APP_ORIGIN || env.APP_ORIGIN.includes("REPLACE")) {
        return fail("Configuration serveur incomplète.", 503);
      }
      let configuredOrigin: URL;
      try { configuredOrigin = new URL(env.APP_ORIGIN); }
      catch { return fail("Configuration serveur invalide.", 503); }
      if (configuredOrigin.origin !== env.APP_ORIGIN || configuredOrigin.protocol !== "https:") {
        return fail("Configuration serveur invalide.", 503);
      }
      return await handle(request, env);
    } catch {
      return fail("Erreur interne. Réessaie plus tard.", 500);
    }
  }
};