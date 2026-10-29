import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const base = process.env.WISHLY_TEST_BASE_URL || "http://127.0.0.1:8787";
const origin = process.env.WISHLY_TEST_ORIGIN || "http://localhost:8787";
const password = "Authenticated-Audit-Integration-Password-2026!";
const email = `wishly.auth-audit.${Date.now()}@example.test`;

function executeLocalSql(sql) {
  const result = spawnSync("npx", [
    "wrangler", "d1", "execute", "wishly-production-db", "--local", "--command", sql
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Local D1 command failed: ${result.stderr || result.stdout}`);
  }
}

async function request(path, { method = "GET", token, body, expected = 200 } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected HTTP ${expected}, got ${response.status}; body=${raw.slice(0, 500)}`
  );
  return { response, data };
}

const registered = await request("/api/auth/register", {
  method: "POST",
  expected: 201,
  body: { email, displayName: "Audit Tester", password }
});
const token = registered.data.sessionToken;
const created = await request("/api/lists", {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Atomic authenticated list", visibility: "private" }
});
const listId = created.data.list.id;
const item = await request(`/api/lists/${listId}/items`, {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Atomic authenticated gift", quantity: 2 }
});
const itemId = item.data.item.id;

let triggerCreated = false;
try {
  executeLocalSql(
    "CREATE TRIGGER test_fail_all_audit BEFORE INSERT ON audit_events " +
    "BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END;"
  );
  triggerCreated = true;

  await request(`/api/lists/${listId}/share`, {
    method: "POST", token, expected: 500, body: {}
  });
  let state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.list.visibility, "private", "failed share audit must roll back sharing");

  await request(`/api/lists/${listId}/archive`, {
    method: "POST", token, expected: 500, body: {}
  });
  state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.list.archived_at, null, "failed archive audit must roll back archiving");

  await request(`/api/lists/${listId}/duplicate`, {
    method: "POST", token, expected: 500
  });
  let lists = await request("/api/lists", { token });
  assert.equal(lists.data.lists.length, 1, "failed duplicate audit must roll back the copied list");

  await request(`/api/lists/${listId}`, {
    method: "PATCH", token, expected: 500, body: { title: "Should Roll Back" }
  });
  state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.list.title, "Atomic authenticated list",
    "failed list-update audit must roll back the title change");

  await request(`/api/lists/${listId}/items/${itemId}`, {
    method: "PATCH", token, expected: 500, body: { title: "Should Roll Back" }
  });
  state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.items[0].title, "Atomic authenticated gift",
    "failed item-update audit must roll back the title change");

  await request(`/api/lists/${listId}/items/${itemId}`, {
    method: "DELETE", token, expected: 500
  });
  state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.items.length, 1, "failed item-delete audit must restore the deleted item");

  await request(`/api/lists/${listId}`, {
    method: "DELETE", token, expected: 500
  });
  state = await request(`/api/lists/${listId}`, { token });
  assert.equal(state.data.list.id, listId, "failed list-delete audit must restore the deleted list");

  await request("/api/account", {
    method: "DELETE", token, expected: 500, body: { password, confirmEmail: email }
  });
  const session = await request("/api/auth/me", { token });
  assert.equal(session.data.user.email, email, "failed account-delete audit must preserve the account");
} finally {
  if (triggerCreated) {
    executeLocalSql("DROP TRIGGER IF EXISTS test_fail_all_audit;");
  }
}

console.log("PASS: local D1 audit failures roll back sharing, archive, duplicate, list/item updates and deletes, and account deletion.");
