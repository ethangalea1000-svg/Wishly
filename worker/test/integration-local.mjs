import assert from "node:assert/strict";

const base = process.env.WISHLY_TEST_BASE_URL || "http://127.0.0.1:8787";
const origin = process.env.WISHLY_TEST_ORIGIN || "http://localhost:8787";
const password = "Integration-Test-Password-2026!";
const email = `wishly.integration.${Date.now()}@example.test`;

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

const health = await request("/api/health");
assert.deepEqual(health.data, { status: "ok", service: "wishly-api" });

const registered = await request("/api/auth/register", {
  method: "POST",
  expected: 201,
  body: { email, displayName: "Integration Tester", password }
});
assert.equal(registered.data.user.email, email);
assert.match(registered.data.sessionToken, /^[a-f0-9]{64}$/);
const token = registered.data.sessionToken;

const me = await request("/api/auth/me", { token });
assert.equal(me.data.user.email, email);

const login = await request("/api/auth/login", {
  method: "POST",
  expected: 200,
  body: { email, password }
});
assert.match(login.data.sessionToken, /^[a-f0-9]{64}$/);
const loginToken = login.data.sessionToken;

const createdList = await request("/api/lists", {
  method: "POST",
  token: loginToken,
  expected: 201,
  body: { title: "Integration wishlist", description: "Local D1 end-to-end test", currency: "EUR" }
});
const listId = createdList.data.list.id;
assert.match(listId, /^[0-9a-f-]{36}$/i);

const createdItem = await request(`/api/lists/${listId}/items`, {
  method: "POST",
  token: loginToken,
  expected: 201,
  body: { title: "Test gift", quantity: 1, priority: 2, priceMinor: 1299, url: "https://example.com/gift?b=2&a=1#details" }
});
const itemId = createdItem.data.item.id;
assert.equal(createdItem.data.item.title, "Test gift");
assert.equal(createdItem.data.item.priceMinor, 1299);
assert.equal(createdItem.data.item.url, "https://example.com/gift?a=1&b=2");

const ownerList = await request(`/api/lists/${listId}`, { token: loginToken });
assert.equal(ownerList.data.items.length, 1);
assert.equal(ownerList.data.items[0].id, itemId);

const shared = await request(`/api/lists/${listId}/share`, {
  method: "POST",
  token: loginToken,
  expected: 200,
  body: {}
});
assert.match(shared.data.shareToken, /^[a-f0-9]{64}$/);

const guestView = await request(`/api/shared/${shared.data.shareToken}`);
assert.equal(guestView.data.list.title, "Integration wishlist");
assert.equal(guestView.data.items.length, 1);
assert.equal(guestView.data.items[0].remaining_quantity, 1);

const reservation = await request(`/api/shared/${shared.data.shareToken}/items/${itemId}/reservations`, {
  method: "POST",
  expected: 201,
  body: { guestName: "Guest Tester" }
});
assert.equal(reservation.data.ok, true);
assert.match(reservation.data.cancellationToken, /^[a-f0-9]{64}$/);

const afterReserve = await request(`/api/shared/${shared.data.shareToken}`);
assert.equal(afterReserve.data.items[0].remaining_quantity, 0);
assert.equal(afterReserve.data.items[0].is_fully_reserved, true);

await request(`/api/shared/${shared.data.shareToken}/items/${itemId}/reservations`, {
  method: "POST",
  expected: 409,
  body: { guestName: "Second Guest" }
});

await request(`/api/reservations/${reservation.data.reservationId}/cancel`, {
  method: "POST",
  expected: 200,
  body: { cancellationToken: reservation.data.cancellationToken }
});
const afterCancel = await request(`/api/shared/${shared.data.shareToken}`);
assert.equal(afterCancel.data.items[0].remaining_quantity, 1);


const revoked = await request(`/api/lists/${listId}/share`, {
  method: "POST",
  token: loginToken,
  expected: 200,
  body: { revoke: true }
});
assert.equal(revoked.data.ok, true);
await request(`/api/shared/${shared.data.shareToken}`, { expected: 404 });

// A second account must not be able to read the owner's private list.
const secondEmail = `wishly.integration.other.${Date.now()}@example.test`;
const secondAccount = await request("/api/auth/register", {
  method: "POST",
  expected: 201,
  body: { email: secondEmail, displayName: "Other Tester", password }
});
await request(`/api/lists/${listId}`, { token: secondAccount.data.sessionToken, expected: 404 });

// Concurrent guest reservations must never exceed the gift's quantity.
const concurrentItem = await request(`/api/lists/${listId}/items`, {
  method: "POST",
  token: loginToken,
  expected: 201,
  body: { title: "Concurrency test gift", quantity: 1, priority: 2 }
});
const concurrentItemId = concurrentItem.data.item.id;
const newShare = await request(`/api/lists/${listId}/share`, {
  method: "POST",
  token: loginToken,
  expected: 200,
  body: {}
});
const concurrentResults = await Promise.all([
  request(`/api/shared/${newShare.data.shareToken}/items/${concurrentItemId}/reservations`, {
    method: "POST", expected: 201, body: { guestName: "Concurrent Guest A" }
  }),
  request(`/api/shared/${newShare.data.shareToken}/items/${concurrentItemId}/reservations`, {
    method: "POST", expected: 409, body: { guestName: "Concurrent Guest B" }
  })
]);
assert.equal(concurrentResults.filter(result => result.response.status === 201).length, 1);
assert.equal(concurrentResults.filter(result => result.response.status === 409).length, 1);
const concurrentView = await request(`/api/shared/${newShare.data.shareToken}`);
assert.equal(concurrentView.data.items.find(item => item.id === concurrentItemId).remaining_quantity, 0);

await request("/api/auth/logout", { method: "POST", token: secondAccount.data.sessionToken, body: {} });

await request("/api/auth/logout", { method: "POST", token: loginToken, body: {} });
await request("/api/auth/me", { token: loginToken, expected: 401 });

console.log("PASS: local D1 integration flow — auth, list ownership, gift, share/revocation, guest reservation, cancellation, capacity conflict and concurrent reservations.");
