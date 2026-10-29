import { describe, expect, it } from "vitest";
import api from "../src/index";

function fakeDb(rateLimitCount = 0) {
  return {
    prepare(sql: string) {
      const statement = {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (sql.includes("SELECT count FROM rate_limits")) return { count: rateLimitCount } as T;
          return { ok: 1 } as T;
        },
        async run() { return { meta: { changes: 1 } }; },
        async all() { return { results: [] }; }
      };
      return statement;
    }
  } as unknown as D1Database;
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

  it("keeps configuration errors readable to the configured frontend origin", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/health", {
      headers: { Origin: "https://wishly.example" }
    }), { ...env, SESSION_PEPPER: "" } as Env);
    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://wishly.example");
    expect(await response.json()).toEqual({ error: "Configuration serveur incomplète." });
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
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("applies security headers to CORS preflight responses", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: "https://wishly.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization"
      }
    }), env);

    expect(response.status).toBe(204);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://wishly.example");
  });

  it("allows credentialed CORS only for the configured application origin", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/health", {
      headers: { Origin: "https://wishly.example" }
    }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://wishly.example");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not grant CORS access to an untrusted origin", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/health", {
      headers: { Origin: "https://attacker.example" }
    }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
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

  it("rate-limits public reservation cancellation attempts", async () => {
    const limitedEnv = { ...env, DB: fakeDb(16) } as Env;
    const response = await api.fetch(new Request(
      "https://wishly.example/api/reservations/123e4567-e89b-42d3-a456-426614174000/cancel",
      {
        method: "POST",
        headers: {
          Origin: "https://wishly.example",
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.10"
        },
        body: JSON.stringify({ cancellationToken: "a".repeat(64) })
      }
    ), limitedEnv);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Trop de tentatives. Réessaie plus tard." });
  });

  it("does not answer unknown routes as successful responses", async () => {
    const response = await api.fetch(new Request("https://wishly.example/api/not-a-route"), env);
    expect(response.status).toBe(401);
  });
});
