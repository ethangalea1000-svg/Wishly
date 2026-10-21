import { describe, expect, it } from "vitest";
import api from "../src/index";

function fakeDb() {
  const statement = {
    bind(..._values: unknown[]) { return this; },
    async first<T>() { return { ok: 1 } as T; },
    async run() { return { meta: { changes: 1 } }; },
    async all() { return { results: [] }; }
  };
  return { prepare(_sql: string) { return statement; } } as unknown as D1Database;
}
const env = {
  DB: fakeDb(),
  APP_ORIGIN: "https://wishly.example",
  SESSION_PEPPER: "test-secret-that-is-long-enough-to-pass-configuration-check"
} as unknown as Env;

describe("Wishly API baseline security", () => {
  it("fails closed when the session secret is missing", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/health"), {
      ...env, SESSION_PEPPER: ""
    } as Env);
    expect(response.status).toBe(503);
  });

  it("allows an HTTP origin only for local development", async () => {
    const localEnv = { ...env, APP_ORIGIN: "http://localhost:8788" } as Env;
    const response = await api.fetch(new Request("http://localhost:8788/api/health"), localEnv);
    expect(response.status).toBe(200);
  });

  it("rejects non-local HTTP deployment origins", async () => {
    const insecureEnv = { ...env, APP_ORIGIN: "http://wishly.example" } as Env;
    const response = await api.fetch(new Request("http://wishly.example/api/health"), insecureEnv);
    expect(response.status).toBe(503);
  });

  it("answers the health check without exposing private data", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "wishly-api" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a state-changing request without an exact Origin", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }), env);
    expect(response.status).toBe(403);
  });

  it("rejects a cross-origin state-changing request", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: "{}"
    }), env);
    expect(response.status).toBe(403);
  });

  it("does not answer unknown routes as successful responses", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/not-a-route"), env);
    expect(response.status).toBe(401);
  });
});
