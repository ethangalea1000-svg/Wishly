import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { createHash } from "node:crypto";
import api from "../src/index";

const APP_ORIGIN = "https://ethangalea1000-svg.github.io";
const API_ORIGIN = "https://wishly-test.local";
const SESSION_PEPPER = "test-only-session-pepper-not-a-production-secret-123";
const MAX_JSON_BODY_BYTES = 64 * 1024;

let mf: Miniflare;
let db: D1Database;
let env: { DB: D1Database; APP_ORIGIN: string; SESSION_PEPPER: string };

async function scalar(sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function applyMigrations() {
  for (const name of [
    "0001_initial.sql",
    "0002_sharing_reservations.sql",
    "0003_unique_gift_urls.sql",
  ]) {
    const sql = await readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
    await db.exec(sql);
  }
}

function jsonRequest(path: string, body: string, options: { origin?: string; contentType?: string; method?: string; token?: string } = {}) {
  const headers = new Headers();
  if (options.origin !== undefined) headers.set("Origin", options.origin);
  else headers.set("Origin", APP_ORIGIN);
  if (options.contentType !== "") headers.set("Content-Type", options.contentType ?? "application/json");
  if (options.token) headers.set("Authorization", "Bearer " + options.token);
  return new Request(API_ORIGIN + path, {
    method: options.method ?? "POST",
    headers,
    body,
  });
}

async function register(email = "auth-flow@example.test") {
  const response = await api.fetch(jsonRequest("/api/auth/register", JSON.stringify({
    email, displayName: "Test Auth", password: "a-long-test-password-123"
  })), env as never);
  const data = await response.json() as { user?: { id: string }; sessionToken?: string; expiresAt?: string; error?: string };
  return { response, data };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(SESSION_PEPPER + ":" + token).digest("hex");
}

beforeEach(async () => {
  mf = new Miniflare({
    workers: [{
      name: "wishly-auth-test-worker",
      script: "export default { fetch() { return new Response('test') } }",
      modules: true,
      d1Databases: { DB: "wishly-auth-tests-" + crypto.randomUUID() },
    }],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, APP_ORIGIN, SESSION_PEPPER };
  await applyMigrations();
});

afterEach(async () => {
  await mf.dispose();
});

describe("Wishly auth flows with isolated local D1", () => {
  it("registers, resolves the session, logs in, and revokes the session on logout", async () => {
    const created = await register();
    expect(created.response.status).toBe(201);
    expect(created.data.user?.id).toBeTruthy();
    expect(created.data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(created.data.expiresAt ?? "")).toBeGreaterThan(Date.now());

    const firstSession = created.data.sessionToken!;
    const me = await api.fetch(new Request(API_ORIGIN + "/api/auth/me", {
      headers: { Origin: APP_ORIGIN, Authorization: "Bearer " + firstSession },
    }), env as never);
    expect(me.status).toBe(200);
    expect((await me.json() as { user: { email: string } }).user.email).toBe("auth-flow@example.test");

    const login = await api.fetch(jsonRequest("/api/auth/login", JSON.stringify({
      email: "AUTH-FLOW@example.test", password: "a-long-test-password-123",
    })), env as never);
    const loginData = await login.json() as { sessionToken?: string };
    expect(login.status).toBe(200);
    expect(loginData.sessionToken).toMatch(/^[a-f0-9]{64}$/);

    const logout = await api.fetch(jsonRequest("/api/auth/logout", "{}", { token: loginData.sessionToken }), env as never);
    expect(logout.status).toBe(200);
    const afterLogout = await api.fetch(new Request(API_ORIGIN + "/api/auth/me", {
      headers: { Origin: APP_ORIGIN, Authorization: "Bearer " + loginData.sessionToken },
    }), env as never);
    expect(afterLogout.status).toBe(401);
    expect(await scalar("SELECT COUNT(*) AS count FROM users")).toBe(1);
    expect(await scalar("SELECT COUNT(*) AS count FROM sessions")).toBe(1);
  });

  it("rejects a session after its persisted expiry time", async () => {
    const created = await register("expiry@example.test");
    expect(created.response.status).toBe(201);
    const token = created.data.sessionToken!;
    await db.prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?")
      .bind("2000-01-01T00:00:00.000Z", tokenHash(token)).run();

    const response = await api.fetch(new Request(API_ORIGIN + "/api/auth/me", {
      headers: { Origin: APP_ORIGIN, Authorization: "Bearer " + token },
    }), env as never);
    expect(response.status).toBe(401);
  });

  it("rejects a wrong password without creating a session", async () => {
    const created = await register("wrong-password@example.test");
    expect(created.response.status).toBe(201);
    const response = await api.fetch(jsonRequest("/api/auth/login", JSON.stringify({
      email: "wrong-password@example.test", password: "not-the-right-password",
    })), env as never);
    expect(response.status).toBe(401);
    expect(await scalar("SELECT COUNT(*) AS count FROM sessions")).toBe(1);
  });
});

describe("Origin, JSON parsing and request-size boundaries", () => {
  it("rejects foreign and missing Origin preflights without CORS permission", async () => {
    for (const origin of ["https://attacker.example", undefined]) {
      const headers = new Headers();
      if (origin) headers.set("Origin", origin);
      headers.set("Access-Control-Request-Method", "POST");
      const response = await api.fetch(new Request(API_ORIGIN + "/api/auth/register", {
        method: "OPTIONS", headers,
      }), env as never);
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect(await scalar("SELECT COUNT(*) AS count FROM users")).toBe(0);
    expect(await scalar("SELECT COUNT(*) AS count FROM rate_limits")).toBe(0);
  });

  it("rejects foreign-origin mutations before touching the database", async () => {
    const response = await api.fetch(jsonRequest("/api/auth/register", JSON.stringify({
      email: "foreign@example.test", displayName: "Foreign", password: "a-long-test-password-123",
    }), { origin: "https://attacker.example" }), env as never);
    expect(response.status).toBe(403);
    expect(await scalar("SELECT COUNT(*) AS count FROM users")).toBe(0);
    expect(await scalar("SELECT COUNT(*) AS count FROM rate_limits")).toBe(0);
  });

  it("rejects malformed JSON and non-JSON content types", async () => {
    const malformed = await api.fetch(jsonRequest("/api/auth/register", "{", { contentType: "application/json" }), env as never);
    expect(malformed.status).toBe(400);
    const wrongType = await api.fetch(jsonRequest("/api/auth/register", "{}", { contentType: "text/plain" }), env as never);
    expect(wrongType.status).toBe(400);
    expect(await scalar("SELECT COUNT(*) AS count FROM users")).toBe(0);
  });

  it("rejects JSON bodies larger than 64 KiB with 413", async () => {
    const body = JSON.stringify({
      email: "oversized@example.test",
      displayName: "Oversized",
      password: "a-long-test-password-123",
      padding: "x".repeat(MAX_JSON_BODY_BYTES),
    });
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MAX_JSON_BODY_BYTES);
    const response = await api.fetch(jsonRequest("/api/auth/register", body), env as never);
    expect(response.status).toBe(413);
    expect(await scalar("SELECT COUNT(*) AS count FROM users")).toBe(0);
  });
});
