import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const base = process.env.WISHLY_TEST_BASE_URL || "http://127.0.0.1:8787";
const origin = process.env.WISHLY_TEST_ORIGIN || "http://localhost:8787";
const password = "Atomic-Audit-Integration-Password-2026!";
const email = `wishly.atomic.${Date.now()}@example.test`;

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
  body: { email, displayName: "Atomic Audit Tester", password }
});
const token = registered.data.sessionToken;
const list = await request("/api/lists", {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Atomic audit integration", visibility: "unlisted" }
});
const item = await request(`/api/lists/${list.data.list.id}/items`, {
  method: "POST",
  token,
  expected: 201,
  body: { title: "Atomic audit gift", quantity: 3 }
});
const shared = await request(`/api/lists/${list.data.list.id}/share`, {
  method: "POST",
  token,
  expected: 200,
  body: {}
});
const shareToken = shared.data.shareToken;
const reservationPath = `/api/shared/${shareToken}/items/${item.data.item.id}/reservations`;
const baselineReservation = await request(reservationPath, {
  method: "POST",
  expected: 201,
  body: { guestName: "Existing Guest" }
});

let triggerCreated = false;
try {
  executeLocalSql(
    "CREATE TRIGGER test_fail_reservation_audit BEFORE INSERT ON audit_events " +
    "WHEN NEW.action LIKE 'reservation.%' BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END;"
  );
  triggerCreated = true;

  await request(reservationPath, {
    method: "POST",
    expected: 500,
    body: { guestName: "Should Roll Back" }
  });
  const afterCreateFailure = await request(`/api/shared/${shareToken}`);
  const giftAfterCreateFailure = afterCreateFailure.data.items.find(gift => gift.id === item.data.item.id);
  assert.equal(giftAfterCreateFailure.remaining_quantity, 2,
    "failed audit insert must roll back the new reservation");

  await request(`/api/reservations/${baselineReservation.data.reservationId}/cancel`, {
    method: "POST",
    expected: 500,
    body: { cancellationToken: baselineReservation.data.cancellationToken }
  });
  const afterCancelFailure = await request(`/api/shared/${shareToken}`);
  const giftAfterCancelFailure = afterCancelFailure.data.items.find(gift => gift.id === item.data.item.id);
  assert.equal(giftAfterCancelFailure.remaining_quantity, 2,
    "failed cancellation audit insert must roll back the cancellation");
} finally {
  if (triggerCreated) {
    executeLocalSql("DROP TRIGGER IF EXISTS test_fail_reservation_audit;");
  }
}

console.log("PASS: local D1 audit failure rolls back guest reservation creation and cancellation.");
