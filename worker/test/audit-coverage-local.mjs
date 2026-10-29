import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const base = process.env.WISHLY_TEST_BASE_URL || "http://127.0.0.1:8787";
const origin = process.env.WISHLY_TEST_ORIGIN || "http://localhost:8787";
const password = "Audit-Coverage-Integration-Password-2026!";
const email = `wishly.audit-coverage.${Date.now()}@example.test`;

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
  return data;
}

function queryLocalSql(sql) {
  const result = spawnSync("npx", [
    "wrangler", "d1", "execute", "wishly-production-db", "--local", "--command", sql, "--json"
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Local D1 query failed: ${result.stderr || result.stdout}`);
  }
  const output = result.stdout.trim();
  let parsed;
  for (let index = 0; index < output.length; index++) {
    if (output[index] !== "[" && output[index] !== "{") continue;
    try {
      parsed = JSON.parse(output.slice(index));
      break;
    } catch {}
  }
  assert.ok(parsed, `Could not parse Wrangler JSON output: ${output.slice(-1000)}`);
  const rows = [];
  function collect(value) {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
    } else if (value && typeof value === "object") {
      if (typeof value.action === "string" && typeof value.entity_id === "string") rows.push(value);
      for (const nested of Object.values(value)) collect(nested);
    }
  }
  collect(parsed);
  return rows;
}

const registered = await request("/api/auth/register", {
  method: "POST",
  expected: 201,
  body: { email, displayName: "Audit Coverage Tester", password }
});
const token = registered.sessionToken;

const created = await request("/api/lists", {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Audit coverage list", visibility: "private" }
});
const listId = created.list.id;

const item = await request(`/api/lists/${listId}/items`, {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Audit coverage gift", quantity: 1 }
});
const itemId = item.item.id;

const shared = await request(`/api/lists/${listId}/share`, {
  method: "POST",
  token,
  expected: 200,
  body: {}
});
assert.match(shared.shareToken, /^[a-f0-9]{64}$/);

await request(`/api/lists/${listId}/share`, {
  method: "POST",
  token,
  expected: 200,
  body: { revoke: true }
});
await request(`/api/shared/${shared.shareToken}`, { expected: 404 });

const escapedEmail = email.replaceAll("'", "''");
const rows = queryLocalSql(
  "SELECT action,entity_type,entity_id FROM audit_events " +
  `WHERE actor_user_id=(SELECT id FROM users WHERE email='${escapedEmail}') ` +
  `AND entity_id IN ('${listId}','${itemId}') ORDER BY created_at`
);
const hasEvent = (action, entityType, entityId) =>
  rows.some(row => row.action === action && row.entity_type === entityType && row.entity_id === entityId);

assert.ok(hasEvent("wishlist.create", "wishlist", listId),
  "list creation must write a wishlist.create audit event");
assert.ok(hasEvent("item.create", "wishlist_item", itemId),
  "gift creation must write an item.create audit event");
assert.ok(hasEvent("wishlist.share", "wishlist", listId),
  "share creation must preserve its existing audit event");
assert.ok(hasEvent("wishlist.share.revoke", "wishlist", listId),
  "share revocation must write a wishlist.share.revoke audit event");

console.log("PASS: local D1 records wishlist.create, item.create and wishlist.share.revoke audit events.");
