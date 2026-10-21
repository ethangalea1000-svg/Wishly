import { describe, expect, it, vi } from "vitest";
import worker from "./index";

function makeEnv(overrides: Record<string, unknown> = {}) {
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes: 0 } })),
        first: vi.fn(async () => ({ ok: 1 })),
        all: vi.fn(async () => ({ results: [] })),
      })),
      run: vi.fn(async () => ({ meta: { changes: 0 } })),
      first: vi.fn(async () => ({ ok: 1 })),
      all: vi.fn(async () => ({ results: [] })),
    })),
  };
  return {
    env: {
      DB: db,
      APP_ORIGIN: "https://ethangalea1000-svg.github.io",
      SESSION_PEPPER: "test-only-pepper-value-with-at-least-32-characters",
      ...overrides,
    } as never,
    db,
  };
}

describe("Wishly Worker HTTP boundary", () => {
  it("answers CORS preflight with Authorization support", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(new Request("https://api.example.test/api/lists", {
      method: "OPTIONS",
      headers: { Origin: "https://ethangalea1000-svg.github.io" },
    }), env);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://ethangalea1000-svg.github.io");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejects mutation requests from a different origin before touching the database", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(new Request("https://api.example.test/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "test@example.com", displayName: "Test", password: "long-test-password" }),
    }), env);

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("rejects browser mutations that have no Origin header", async () => {
    const { env, db } = makeEnv();
    const response = await worker.fetch(new Request("https://api.example.test/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }), env);

    expect(response.status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns CORS headers on unknown-route errors for the approved origin", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://api.example.test/api/not-a-route", {
      method: "GET",
      headers: { Origin: "https://ethangalea1000-svg.github.io" },
    }), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://ethangalea1000-svg.github.io");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("fails closed when the session pepper is missing or too short", async () => {
    for (const pepper of ["", "too-short"]) {
      const { env, db } = makeEnv({ SESSION_PEPPER: pepper });
      const response = await worker.fetch(new Request("https://api.example.test/api/health"), env);

      expect(response.status).toBe(503);
      expect(db.prepare).not.toHaveBeenCalled();
    }
  });
});
