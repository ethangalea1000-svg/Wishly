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
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Vary", "Origin");
  return new Response(JSON.stringify(data), { status, headers });
}
function fail(message: string, status = 400, extra: HeadersInit = {}): Response {
  return json({ error: message }, status, extra);
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
class RateLimitUnavailableError extends Error {
  constructor() {
    super("Rate-limit storage unavailable");
    this.name = "RateLimitUnavailableError";
  }
}
async function rateLimit(request: Request, env: Env, bucket: string, max = 12): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(`${env.SESSION_PEPPER}:${bucket}:${ip}`);
  const now = Math.floor(Date.now() / 60000);
  try {
    await env.DB.prepare(
      "INSERT INTO rate_limits(bucket_key,count,window_started_at) VALUES(?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN window_started_at=? THEN count+1 ELSE 1 END, window_started_at=?"
    ).bind(key, now, now, now).run();
    const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket_key=?").bind(key).first<{count:number}>();
    return (row?.count ?? 0) <= max;
  } catch {
    // Never bypass rate limiting when its persistent storage is unavailable.
    throw new RateLimitUnavailableError();
  }
}
function sessionTokenFromRequest(request: Request): string | undefined {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  return bearer || parseCookies(request).get(SESSION_COOKIE);
}
async function getUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = sessionTokenFromRequest(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(`${env.SESSION_PEPPER}:${token}`);
  const row = await env.DB.prepare(
    "SELECT u.id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.deleted_at IS NULL"
  ).bind(tokenHash, new Date().toISOString()).first<SessionUser>();
  if (row) await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?")
    .bind(new Date().toISOString(), tokenHash).run();
  return row ?? null;
}
const MAX_JSON_BODY_BYTES = 64 * 1024;
async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("Content-Type") || "";
  if (type.toLowerCase().split(";")[0].trim() !== "application/json") return null;

  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_JSON_BODY_BYTES) return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
function hasControlCharacters(value: string): boolean {
  return /[\x00-\x1F\x7F]/.test(value);
}
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (hasControlCharacters(result)) return null;
  return result.length > 0 && result.length <= max ? result : null;
}
function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function normalizeGiftUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.searchParams.sort();
  return parsed.toString();
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
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
  const mutation = request.method !== "GET" && request.method !== "HEAD";
  if (mutation && request.headers.get("Origin") !== env.APP_ORIGIN) return fail("Origine non autorisée.", 403);

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
      return json({ user: { id, email, displayName, role: "user" }, sessionToken: session.token }, 201, headers);
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
    return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role }, sessionToken: session.token }, 200, headers);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = sessionTokenFromRequest(request);
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

  const publicListMatch = url.pathname.match(/^\/api\/shared\/([a-f0-9]{64})$/);
  if (publicListMatch && request.method === "GET") {
    const list = await env.DB.prepare(
      "SELECT id,title,description,occasion,event_date,currency FROM wishlists WHERE share_token=? AND visibility IN ('public','unlisted') AND archived_at IS NULL"
    ).bind(publicListMatch[1]).first<{id:string;title:string;description:string;occasion:string|null;event_date:string|null;currency:string}>();
    if (!list) return fail("Liste introuvable.",404);
    const result = await env.DB.prepare(
      "SELECT i.id,i.title,i.url,i.image_url,i.description,i.category,i.price_minor,i.currency,i.quantity,i.priority, (SELECT COUNT(*) FROM reservations r WHERE r.item_id=i.id AND r.status='active') AS reserved_quantity FROM wishlist_items i WHERE i.wishlist_id=? ORDER BY i.priority DESC,i.created_at DESC LIMIT 200"
    ).bind(list.id).all();
    const items = result.results.map((item:any)=>({...item,remaining_quantity:Math.max(0,Number(item.quantity)-Number(item.reserved_quantity)),is_fully_reserved:Number(item.reserved_quantity)>=Number(item.quantity)}));
    return json({list,items},200,headers);
  }
  const publicReserveMatch=url.pathname.match(/^\/api\/shared\/([a-f0-9]{64})\/items\/([0-9a-f-]{36})\/reservations$/i);
  if(publicReserveMatch && request.method==="POST"){
    if(!(await rateLimit(request,env,"guest-reservation",15)))return fail("Trop de tentatives. Réessaie plus tard.",429);
    const list=await env.DB.prepare("SELECT id FROM wishlists WHERE share_token=? AND visibility IN ('public','unlisted') AND archived_at IS NULL")
      .bind(publicReserveMatch[1]).first<{id:string}>();
    if(!list)return fail("Liste introuvable.",404);
    const body=await bodyJson(request);
    if(!body)return fail("Corps JSON invalide.");
    const guestName=cleanText(body.guestName,60);
    if(!guestName||/[<>]/.test(guestName))return fail("Nom invalide.");
    const item=await env.DB.prepare("SELECT id,quantity FROM wishlist_items WHERE id=? AND wishlist_id=?")
      .bind(publicReserveMatch[2],list.id).first<{id:string;quantity:number}>();
    if(!item)return fail("Cadeau introuvable.",404);
    const reservationId=randomId();
    const cancelToken=randomToken();
    const tokenHash=await sha256(env.SESSION_PEPPER+":"+cancelToken);
    const reservationWrites = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO reservations(id,item_id,guest_name,cancel_token_hash,status) SELECT ?,?,?,?,'active' WHERE (SELECT COUNT(*) FROM reservations WHERE item_id=? AND status='active') < ?"
      ).bind(reservationId,item.id,guestName,tokenHash,item.id,item.quantity),
      env.DB.prepare(
        "INSERT INTO audit_events(id,action,entity_type,entity_id) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM reservations WHERE id=? AND cancel_token_hash=? AND status='active')"
      ).bind(randomId(),"reservation.create","reservation",reservationId,reservationId,tokenHash)
    ]);
    if(!reservationWrites[0].meta.changes)return fail("Ce cadeau vient d'être entièrement réservé. Actualise la liste.",409);
    return json({ok:true,reservationId,cancellationToken:cancelToken,message:"Garde ce code pour annuler ta réservation."},201,headers);
  }
  const cancelMatch=url.pathname.match(/^\/api\/reservations\/([0-9a-f-]{36})\/cancel$/i);
  if(cancelMatch && request.method==="POST"){
    if(!(await rateLimit(request,env,"reservation-cancel",15)))return fail("Trop de tentatives. Réessaie plus tard.",429);
    const body=await bodyJson(request);
    const cancelToken=typeof body?.cancellationToken==="string"?body.cancellationToken:"";
    if(!/^[a-f0-9]{64}$/.test(cancelToken))return fail("Code d'annulation invalide.",403);
    const tokenHash=await sha256(env.SESSION_PEPPER+":"+cancelToken);
    const cancelledAt = new Date().toISOString();
    const cancellationWrites = await env.DB.batch([
      env.DB.prepare("UPDATE reservations SET status='cancelled',updated_at=? WHERE id=? AND cancel_token_hash=? AND status='active'")
        .bind(cancelledAt,cancelMatch[1],tokenHash),
      env.DB.prepare(
        "INSERT INTO audit_events(id,action,entity_type,entity_id) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM reservations WHERE id=? AND cancel_token_hash=? AND status='cancelled' AND updated_at=?)"
      ).bind(randomId(),"reservation.cancel","reservation",cancelMatch[1],cancelMatch[1],tokenHash,cancelledAt)
    ]);
    if(!cancellationWrites[0].meta.changes)return fail("Réservation introuvable ou déjà annulée.",404);
    return json({ok:true},200,headers);
  }

  const user = await getUser(request, env);
  if (!user) return fail("Authentification requise.", 401);

  if(url.pathname==="/api/account/export" && request.method==="GET"){
    const account=await env.DB.prepare("SELECT id,email,display_name,created_at,email_verified_at FROM users WHERE id=? AND deleted_at IS NULL")
      .bind(user.id).first();
    if(!account)return fail("Compte introuvable.",404);
    const lists=await env.DB.prepare("SELECT id,title,description,visibility,occasion,event_date,currency,archived_at,created_at,updated_at FROM wishlists WHERE owner_id=? ORDER BY created_at")
      .bind(user.id).all<any>();
    const exportedLists=await Promise.all(lists.results.map(async(list:any)=>{
      const items=await env.DB.prepare("SELECT id,title,url,image_url,description,category,price_minor,currency,quantity,priority,status,created_at,updated_at FROM wishlist_items WHERE wishlist_id=? ORDER BY created_at")
        .bind(list.id).all();
      return {...list,items:items.results};
    }));
    return json({exportedAt:new Date().toISOString(),account,lists:exportedLists},200,headers);
  }
  if(url.pathname==="/api/account" && request.method==="DELETE"){
    const body=await bodyJson(request);
    const password=typeof body?.password==="string"?body.password:"";
    const confirmEmail=typeof body?.confirmEmail==="string"?body.confirmEmail.trim().toLowerCase():"";
    const account=await env.DB.prepare("SELECT email,password_hash,password_salt,password_iterations FROM users WHERE id=? AND deleted_at IS NULL")
      .bind(user.id).first<{email:string;password_hash:string;password_salt:string;password_iterations:number}>();
    if(!account)return fail("Compte introuvable.",404);
    if(confirmEmail!==account.email.toLowerCase()||password.length===0||password.length>128)return fail("Confirmation invalide.",403);
    const calculated=await derivePassword(password,account.password_salt,account.password_iterations);
    if(calculated!==account.password_hash)return fail("Confirmation invalide.",403);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)")
        .bind(randomId(),user.id,"account.delete","user",user.id),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id)
    ]);
    headers.append("Set-Cookie",clearCookie());
    return json({ok:true},200,headers);
  }

  const shareOwnerMatch=url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})\/share$/i);
  if(shareOwnerMatch && request.method==="POST"){
    const listId=shareOwnerMatch[1];
    const owned=await env.DB.prepare("SELECT id,share_token,visibility FROM wishlists WHERE id=? AND owner_id=?").bind(listId,user.id)
      .first<{id:string;share_token:string|null;visibility:string}>();
    if(!owned)return fail("Liste introuvable.",404);
    const body=await bodyJson(request);
    if(body?.revoke===true){
      await env.DB.prepare("UPDATE wishlists SET share_token=NULL,visibility='private',updated_at=? WHERE id=? AND owner_id=?")
        .bind(new Date().toISOString(),listId,user.id).run();
      return json({ok:true,shareUrl:null},200,headers);
    }
    const token=owned.share_token && owned.visibility === "unlisted" ? owned.share_token : randomToken();
    await env.DB.batch([
      env.DB.prepare("UPDATE wishlists SET share_token=?,visibility='unlisted',updated_at=? WHERE id=? AND owner_id=?")
        .bind(token,new Date().toISOString(),listId,user.id),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlists WHERE id=? AND owner_id=? AND share_token=? AND visibility='unlisted')")
        .bind(randomId(),user.id,"wishlist.share","wishlist",listId,listId,user.id,token)
    ]);
    return json({shareToken:token,sharePath:"/shared/"+token,visibility:"unlisted"},200,headers);
  }

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
    const occasion = typeof body?.occasion === "string" ? body.occasion.trim().slice(0,80) : null;
    if (occasion !== null && hasControlCharacters(occasion)) return fail("Occasion invalide.");
    const eventDate = body?.eventDate == null || body?.eventDate === "" ? null : body.eventDate;
    const currency = typeof body?.currency === "string" ? body.currency : "EUR";
    if (!title || /[<>]/.test(title)) return fail("Titre invalide.");
    if (eventDate !== null && (typeof eventDate !== "string" || !isValidDateOnly(eventDate))) return fail("Date invalide.");
    if (!/^[A-Z]{3}$/.test(currency)) return fail("Devise invalide.");
    const id = randomId();
    await env.DB.prepare("INSERT INTO wishlists(id,owner_id,title,description,visibility,occasion,event_date,currency) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, user.id, title, description, visibility, occasion, eventDate, currency).run();
    return json({ list: { id, title, description, visibility, occasion, eventDate, currency } }, 201, headers);
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
    const owned = await env.DB.prepare("SELECT id,currency FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listId, user.id).first<{id:string;currency:string}>();
    if (!owned) return fail("Liste introuvable.", 404);
    const body = await bodyJson(request);
    const title = cleanText(body?.title, 160);
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const category = cleanText(body?.category, 80);
    const urlInput = cleanText(body?.url, 2048);
    let urlValue: string | null = urlInput;
    if (!title || /[<>]/.test(title)) return fail("Titre de cadeau invalide.");
    if (body?.url != null && body.url !== "" && !urlInput) return fail("URL invalide.");
    if (urlInput) {
      try {
        const parsed = new URL(urlInput);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fail("Seules les URL HTTP(S) sont autorisées.");
        if (parsed.username || parsed.password) return fail("URL invalide.");
        urlValue = normalizeGiftUrl(parsed.toString());
      } catch { return fail("URL invalide."); }
    }
    if (urlValue) {
      const duplicate = await env.DB.prepare("SELECT id FROM wishlist_items WHERE wishlist_id=? AND url=?")
        .bind(listId,urlValue).first();
      if (duplicate) return fail("Ce lien est déjà présent dans cette liste.",409);
    }
    const quantity = Number.isInteger(body?.quantity) ? Number(body?.quantity) : 1;
    const priority = Number.isInteger(body?.priority) ? Number(body?.priority) : 2;
    const priceMinor = body?.priceMinor == null ? null : Number(body.priceMinor);
    const currency = typeof body?.currency === "string" ? body.currency : owned.currency;
    if (!/^[A-Z]{3}$/.test(currency)) return fail("Devise invalide.");
    if (quantity < 1 || quantity > 99 || priority < 1 || priority > 3) return fail("Quantité ou priorité invalide.");
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > 100000000)) return fail("Prix invalide.");
    const id = randomId();
    await env.DB.prepare(
      "INSERT INTO wishlist_items(id,wishlist_id,title,url,description,category,price_minor,currency,quantity,priority) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).bind(id, listId, title, urlValue, description, category, priceMinor, currency, quantity, priority).run();
    return json({ item: { id, wishlistId: listId, title, url: urlValue, description, category, priceMinor, currency, quantity, priority, status: "wanted" } }, 201, headers);
  }


  const listAction = url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})\/(archive|duplicate)$/i);
  if (listAction && listAction[2].toLowerCase() === "archive" && request.method === "POST") {
    const listId = listAction[1];
    const owned = await env.DB.prepare("SELECT id,archived_at FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listId, user.id).first<{id:string;archived_at:string|null}>();
    if (!owned) return fail("Liste introuvable.", 404);
    const archivedAt = owned.archived_at ? null : new Date().toISOString();
    const archiveUpdatedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE wishlists SET archived_at=?,updated_at=? WHERE id=? AND owner_id=?")
        .bind(archivedAt, archiveUpdatedAt, listId, user.id),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlists WHERE id=? AND owner_id=? AND archived_at IS ? AND updated_at=?)")
        .bind(randomId(), user.id, archivedAt ? "wishlist.archive" : "wishlist.restore", "wishlist", listId, listId, user.id, archivedAt, archiveUpdatedAt)
    ]);
    return json({ ok:true, archivedAt }, 200, headers);
  }
  if (listAction && listAction[2].toLowerCase() === "duplicate" && request.method === "POST") {
    const listId = listAction[1];
    const source = await env.DB.prepare("SELECT title,description,visibility,occasion,event_date,currency FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listId, user.id).first<{title:string;description:string;visibility:string;occasion:string|null;event_date:string|null;currency:string}>();
    if (!source) return fail("Liste introuvable.", 404);
    const newId = randomId();
    const newTitle = (source.title + " (copie)").slice(0,100);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO wishlists(id,owner_id,title,description,visibility,occasion,event_date,currency) VALUES(?,?,?,?,?,?,?,?)")
        .bind(newId, user.id, newTitle, source.description, "private", source.occasion, source.event_date, source.currency),
      env.DB.prepare("INSERT INTO wishlist_items(id,wishlist_id,title,url,image_url,description,category,price_minor,currency,quantity,priority,status) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),?,title,url,image_url,description,category,price_minor,currency,quantity,priority,'wanted' FROM wishlist_items WHERE wishlist_id=?")
        .bind(newId, listId),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlists WHERE id=? AND owner_id=?)")
        .bind(randomId(), user.id, "wishlist.duplicate", "wishlist", newId, newId, user.id)
    ]);
    return json({ list:{id:newId,title:newTitle,description:source.description,visibility:"private"} },201,headers);
  }

  const listResource = url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})$/i);
  if (listResource && request.method === "PATCH") {
    const listId = listResource[1];
    const body = await bodyJson(request);
    if (!body) return fail("Corps JSON invalide.");
    const owned = await env.DB.prepare("SELECT id FROM wishlists WHERE id=? AND owner_id=?").bind(listId,user.id).first();
    if (!owned) return fail("Liste introuvable.",404);
    const fields: string[] = [];
    const values: unknown[] = [];
    if ("title" in body) {
      const title=cleanText(body.title,100);
      if(!title || /[<>]/.test(title)) return fail("Titre invalide.");
      fields.push("title=?"); values.push(title);
    }
    if ("description" in body) {
      if(typeof body.description!=="string" || body.description.length>2000) return fail("Description invalide.");
      fields.push("description=?"); values.push(body.description.trim());
    }
    if ("visibility" in body) {
      if(!["private","unlisted","public"].includes(String(body.visibility))) return fail("Visibilité invalide.");
      fields.push("visibility=?"); values.push(body.visibility);
      if (body.visibility === "private") { fields.push("share_token=?"); values.push(null); }
    }
    if ("occasion" in body) {
      if(body.occasion!==null && (typeof body.occasion!=="string" || body.occasion.length>80 || hasControlCharacters(body.occasion))) return fail("Occasion invalide.");
      fields.push("occasion=?"); values.push(body.occasion);
    }
    if ("eventDate" in body) {
      if(body.eventDate!==null && (typeof body.eventDate!=="string" || !isValidDateOnly(body.eventDate))) return fail("Date invalide.");
      fields.push("event_date=?"); values.push(body.eventDate);
    }
    if ("currency" in body) {
      if(typeof body.currency!=="string" || !/^[A-Z]{3}$/.test(body.currency)) return fail("Devise invalide.");
      fields.push("currency=?"); values.push(body.currency);
    }
    if (!fields.length) return fail("Aucune modification fournie.");
    fields.push("updated_at=?"); values.push(new Date().toISOString());
    values.push(listId,user.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE wishlists SET "+fields.join(",")+" WHERE id=? AND owner_id=?").bind(...values),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlists WHERE id=? AND owner_id=?)")
        .bind(randomId(),user.id,"wishlist.update","wishlist",listId,listId,user.id)
    ]);
    const list=await env.DB.prepare("SELECT id,title,description,visibility,occasion,event_date,currency,archived_at,created_at,updated_at FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listId,user.id).first();
    return json({list},200,headers);
  }
  if (listResource && request.method === "DELETE") {
    const listToDelete = await env.DB.prepare("SELECT id FROM wishlists WHERE id=? AND owner_id=?")
      .bind(listResource[1],user.id).first();
    if(!listToDelete) return fail("Liste introuvable.",404);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlists WHERE id=? AND owner_id=?)")
        .bind(randomId(),user.id,"wishlist.delete","wishlist",listResource[1],listResource[1],user.id),
      env.DB.prepare("DELETE FROM wishlists WHERE id=? AND owner_id=?")
        .bind(listResource[1],user.id)
    ]);
    return json({ok:true},200,headers);
  }

  const itemResource=url.pathname.match(/^\/api\/lists\/([0-9a-f-]{36})\/items\/([0-9a-f-]{36})$/i);
  if(itemResource && request.method==="PATCH"){
    const [,listId,itemId]=itemResource;
    const owned=await env.DB.prepare("SELECT id FROM wishlists WHERE id=? AND owner_id=?").bind(listId,user.id).first();
    if(!owned) return fail("Liste introuvable.",404);
    const existing=await env.DB.prepare("SELECT id FROM wishlist_items WHERE id=? AND wishlist_id=?").bind(itemId,listId).first();
    if(!existing) return fail("Cadeau introuvable.",404);
    const body=await bodyJson(request); if(!body) return fail("Corps JSON invalide.");
    const fields:string[]=[]; const values:unknown[]=[];
    if("title" in body){const v=cleanText(body.title,160);if(!v||/[<>]/.test(v))return fail("Titre invalide.");fields.push("title=?");values.push(v);}
    if("description" in body){if(typeof body.description!=="string"||body.description.length>2000)return fail("Description invalide.");fields.push("description=?");values.push(body.description.trim());}
    if("category" in body){if(body.category!==null&&(typeof body.category!=="string"||body.category.length>80||hasControlCharacters(body.category)))return fail("Catégorie invalide.");fields.push("category=?");values.push(body.category);}
    if("url" in body){
      let value:string|null=null;
      if(body.url!==null&&body.url!==""){
        if(typeof body.url!=="string"||body.url.length>2048)return fail("URL invalide.");
        try{const parsed=new URL(body.url);if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)return fail("URL invalide.");value=normalizeGiftUrl(parsed.toString());}
        catch{return fail("URL invalide.");}
      }
      if(value){const duplicate=await env.DB.prepare("SELECT id FROM wishlist_items WHERE wishlist_id=? AND url=? AND id<>?").bind(listId,value,itemId).first();if(duplicate)return fail("Ce lien est déjà présent dans cette liste.",409);}
      fields.push("url=?");values.push(value);
    }
    if("quantity" in body){if(!Number.isInteger(body.quantity)||Number(body.quantity)<1||Number(body.quantity)>99)return fail("Quantité invalide.");fields.push("quantity=?");values.push(body.quantity);}
    if("priority" in body){if(!Number.isInteger(body.priority)||Number(body.priority)<1||Number(body.priority)>3)return fail("Priorité invalide.");fields.push("priority=?");values.push(body.priority);}
    if("status" in body){if(!["wanted","reserved","purchased"].includes(String(body.status)))return fail("Statut invalide.");fields.push("status=?");values.push(body.status);}
    if("priceMinor" in body){if(body.priceMinor!==null&&(!Number.isSafeInteger(body.priceMinor)||Number(body.priceMinor)<0||Number(body.priceMinor)>100000000))return fail("Prix invalide.");fields.push("price_minor=?");values.push(body.priceMinor);}
    if("currency" in body){if(typeof body.currency!=="string"||! /^[A-Z]{3}$/.test(body.currency))return fail("Devise invalide.");fields.push("currency=?");values.push(body.currency);}
    if(!fields.length)return fail("Aucune modification fournie.");
    fields.push("updated_at=?");values.push(new Date().toISOString());values.push(itemId,listId);
    await env.DB.batch([
      env.DB.prepare("UPDATE wishlist_items SET "+fields.join(",")+" WHERE id=? AND wishlist_id=?").bind(...values),
      env.DB.prepare("UPDATE wishlists SET updated_at=? WHERE id=?").bind(new Date().toISOString(),listId),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlist_items WHERE id=? AND wishlist_id=?)")
        .bind(randomId(),user.id,"item.update","wishlist_item",itemId,itemId,listId)
    ]);
    const item=await env.DB.prepare("SELECT id,title,url,image_url,description,category,price_minor,currency,quantity,priority,status,created_at,updated_at FROM wishlist_items WHERE id=? AND wishlist_id=?")
      .bind(itemId,listId).first();
    return json({item},200,headers);
  }
  if(itemResource && request.method==="DELETE"){
    const [,listId,itemId]=itemResource;
    const owned=await env.DB.prepare("SELECT id FROM wishlists WHERE id=? AND owner_id=?").bind(listId,user.id).first();
    if(!owned)return fail("Liste introuvable.",404);
    const existingItem = await env.DB.prepare("SELECT id FROM wishlist_items WHERE id=? AND wishlist_id=?")
      .bind(itemId,listId).first();
    if(!existingItem)return fail("Cadeau introuvable.",404);
    await env.DB.batch([
      env.DB.prepare("UPDATE wishlists SET updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM wishlist_items WHERE id=? AND wishlist_id=?)")
        .bind(new Date().toISOString(),listId,itemId,listId),
      env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM wishlist_items WHERE id=? AND wishlist_id=?)")
        .bind(randomId(),user.id,"item.delete","wishlist_item",itemId,itemId,listId),
      env.DB.prepare("DELETE FROM wishlist_items WHERE id=? AND wishlist_id=?")
        .bind(itemId,listId)
    ]);
    return json({ok:true},200,headers);
  }

  return fail("Route introuvable.", 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Keep configuration errors readable by the exact configured frontend origin.
      // Without these headers, browsers hide the useful HTTP 503 behind a generic
      // "Failed to fetch" message, making deployment misconfiguration hard to diagnose.
      const requestOrigin = request.headers.get("Origin");
      const diagnosticCors: HeadersInit = requestOrigin && requestOrigin === env.APP_ORIGIN ? {
        "Access-Control-Allow-Origin": env.APP_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin"
      } : {};
      if (!env.SESSION_PEPPER || env.SESSION_PEPPER.length < 32 ||
          !env.APP_ORIGIN || env.APP_ORIGIN.includes("REPLACE")) {
        return fail("Configuration serveur incomplète.", 503, diagnosticCors);
      }
      let configuredOrigin: URL;
      try { configuredOrigin = new URL(env.APP_ORIGIN); }
      catch { return fail("Configuration serveur invalide.", 503, diagnosticCors); }
      const localHttp = configuredOrigin.protocol === "http:" &&
        (configuredOrigin.hostname === "localhost" || configuredOrigin.hostname === "127.0.0.1");
      if (configuredOrigin.origin !== env.APP_ORIGIN ||
          (configuredOrigin.protocol !== "https:" && !localHttp)) {
        return fail("Configuration serveur invalide.", 503);
      }
      const response = await handle(request, env);
      const origin = request.headers.get("Origin");
      if (origin === env.APP_ORIGIN) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", env.APP_ORIGIN);
        responseHeaders.set("Access-Control-Allow-Credentials", "true");
        responseHeaders.set("Vary", "Origin");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }
      return response;
    } catch (error) {
      const origin = request.headers.get("Origin");
      const corsHeaders: HeadersInit = origin === env.APP_ORIGIN ? {
        "Access-Control-Allow-Origin": env.APP_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin"
      } : {};
      if (error instanceof RateLimitUnavailableError) {
        return fail("Limitation de débit temporairement indisponible.", 503, corsHeaders);
      }
      return fail("Erreur interne. Réessaie plus tard.", 500, corsHeaders);
    }
  }
};
