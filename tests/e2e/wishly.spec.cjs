const { test, expect } = require("@playwright/test");

const API = "https://wishly-production-api.ethan-galea1000.workers.dev/api";
const LIST_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const SHARE_TOKEN = "a".repeat(64);
const RESERVATION_ID = "33333333-3333-4333-8333-333333333333";
const CANCEL_TOKEN = "b".repeat(64);

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "access-control-allow-credentials": "true" },
    body: JSON.stringify(body),
  });
}

async function mockApi(page) {
  const calls = [];
  let lists = [];
  let items = [];
  let reserved = false;

  await page.route(API + "/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, "");
    const method = request.method();
    let body = {};
    try { body = request.postDataJSON() || {}; } catch {}
    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      }});
    }
    calls.push({ method, path, body });

    if (path === "health" && method === "GET") return json(route, { status: "ok", service: "wishly-api" });
    if (path === "auth/register" && method === "POST") {
      return json(route, { user: { id: "user-test", email: body.email, displayName: body.displayName, role: "user" }, sessionToken: "c".repeat(64) }, 201);
    }
    if (path === "auth/login" && method === "POST") {
      return json(route, { user: { id: "user-test", email: body.email, displayName: "Test Wishly", role: "user" }, sessionToken: "c".repeat(64) });
    }
    if (path === "auth/logout" && method === "POST") return json(route, { ok: true });
    if (path === "lists" && method === "GET") return json(route, { lists });
    if (path === "lists" && method === "POST") {
      const list = { id: LIST_ID, title: body.title, description: body.description || "", visibility: "private", occasion: body.occasion || null, event_date: body.eventDate || null, currency: body.currency || "EUR" };
      lists = [list, ...lists.filter(item => item.id !== LIST_ID)];
      items = [];
      return json(route, { list }, 201);
    }
    if (path === "lists/" + LIST_ID && method === "GET") {
      const list = lists.find(item => item.id === LIST_ID);
      return list ? json(route, { list, items }) : json(route, { error: "Liste introuvable." }, 404);
    }
    if (path === "lists/" + LIST_ID + "/items" && method === "POST") {
      const item = { id: ITEM_ID, wishlist_id: LIST_ID, title: body.title, url: body.url, description: body.description || "", category: body.category || "", quantity: body.quantity || 1, priority: body.priority || 2, price_minor: body.priceMinor, currency: body.currency || "EUR", status: "wanted", created_at: new Date().toISOString() };
      items = [item, ...items.filter(entry => entry.id !== ITEM_ID)];
      return json(route, { item }, 201);
    }
    if (path === "lists/" + LIST_ID + "/share" && method === "POST") {
      return json(route, body.revoke ? { ok: true, shareUrl: null } : { shareToken: SHARE_TOKEN, sharePath: "/shared/" + SHARE_TOKEN, visibility: "unlisted" });
    }
    if (path === "lists/" + LIST_ID + "/duplicate" && method === "POST") return json(route, { list: { id: "44444444-4444-4444-8444-444444444444", title: "Copie", visibility: "private" } }, 201);
    if (path === "lists/" + LIST_ID + "/archive" && method === "POST") return json(route, { ok: true, archivedAt: null });
    if (path === "shared/" + SHARE_TOKEN && method === "GET") {
      return json(route, { list: { title: "Liste partagée de test", description: "Description de test", currency: "EUR" }, items: [{ id: ITEM_ID, title: "Livre de test", description: "Un cadeau", category: "Lecture", price_minor: 1599, currency: "EUR", priority: 2, remaining_quantity: reserved ? 0 : 1, quantity: 1, url: null }] });
    }
    if (path === "shared/" + SHARE_TOKEN + "/items/" + ITEM_ID + "/reservations" && method === "POST") {
      if (reserved) return json(route, { error: "Plus de quantité disponible." }, 409);
      reserved = true;
      return json(route, { reservationId: RESERVATION_ID, cancellationToken: CANCEL_TOKEN }, 201);
    }
    if (path === "reservations/" + RESERVATION_ID + "/cancel" && method === "POST") {
      if (body.cancellationToken !== CANCEL_TOKEN) return json(route, { error: "Code invalide." }, 403);
      reserved = false;
      return json(route, { ok: true });
    }
    return json(route, { error: "Route de test non simulée : " + method + " " + path }, 501);
  });

  return { calls };
}

test("inscription, création de liste, ajout de cadeau, partage, révocation et déconnexion", async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto("/index.html");

  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom affiché").fill("Test Wishly");
  await page.getByLabel("Adresse e-mail").fill("wishly-e2e@example.test");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-de-test-123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.locator("#appView")).toBeVisible();
  await page.getByLabel("Titre de la liste").fill("Anniversaire E2E");
  await page.getByLabel("Description (facultatif)").fill("Liste créée automatiquement");
  await page.getByRole("button", { name: "Créer la liste" }).click();
  await expect(page.locator("#appNotice")).toContainText("Liste créée.");
  await expect(page.locator("#itemForm")).toBeVisible({ timeout: 15000 });

  await page.locator("#itemTitle").fill("Livre de test");
  await page.locator("#itemDescription").fill("Un cadeau de test");
  await page.locator("#itemCategory").fill("Lecture");
  await page.getByRole("button", { name: "Ajouter le cadeau" }).click();
  await expect(page.getByRole("heading", { name: "Livre de test" })).toBeVisible();

  await page.getByRole("button", { name: "Partager" }).click();
  await expect.poll(() => calls.some(call => call.path === "lists/" + LIST_ID + "/share" && call.method === "POST" && !call.body.revoke)).toBe(true);
  await expect(page.locator("#appNotice")).toContainText(/Lien de partage copié|Lien de partage :/);

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Désactiver le lien" }).click();
  await expect(page.locator("#appNotice")).toContainText("Lien de partage désactivé.");

  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page.locator("#authView")).toBeVisible();
  await expect(page.locator("#appView")).toBeHidden();
  await expect.poll(() => calls.some(call => call.path === "auth/logout" && call.method === "POST")).toBe(true);
});

test("partage invité : afficher la liste, réserver et annuler avec le code", async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto("/shared.html?token=" + SHARE_TOKEN);

  await expect(page.getByRole("heading", { name: "Liste partagée de test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Livre de test" })).toBeVisible();
  await expect(page.getByText(/Les réservations sont anonymes pour le propriétaire/)).toBeVisible();

  await page.getByRole("textbox", { name: "Ton prénom pour la réservation" }).fill("Invité test");
  await page.getByRole("button", { name: "Réserver" }).click();
  await expect(page.getByText(/Réservation enregistrée\./)).toBeVisible();
  await expect(page.locator("code")).toHaveText(CANCEL_TOKEN);

  await page.getByLabel("Référence").fill(RESERVATION_ID);
  await page.getByLabel("Code d’annulation").fill(CANCEL_TOKEN);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator("#notice")).toContainText("Réservation annulée.");
  await expect.poll(() => calls.some(call => call.path === "reservations/" + RESERVATION_ID + "/cancel" && call.method === "POST")).toBe(true);
});

test("un lien de partage invalide est refusé sans requête API", async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto("/shared.html?token=invalid");
  await expect(page.getByRole("heading", { name: "Liste indisponible" })).toBeVisible();
  await expect(page.locator("#notice")).toContainText("Lien de partage invalide.");
  expect(calls.some(call => call.path.startsWith("shared/"))).toBe(false);
});


test("une ancienne réponse de détail ne remplace pas la liste sélectionnée ensuite", async ({ page }) => {
  const LIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LIST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const calls = [];

  await page.route(API + "/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, "");
    const method = request.method();

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      }});
    }

    calls.push({ method, path });
    if (path === "auth/login" && method === "POST") {
      return json(route, { user: { id: "user-race", email: "race@example.test", displayName: "Test", role: "user" }, sessionToken: "d".repeat(64) });
    }
    if (path === "lists" && method === "GET") {
      return json(route, { lists: [
        { id: LIST_A, title: "Liste A lente", description: "Réponse différée" },
        { id: LIST_B, title: "Liste B choisie", description: "Réponse rapide" },
      ] });
    }
    if (path === "lists/" + LIST_A && method === "GET") {
      await new Promise(resolve => setTimeout(resolve, 400));
      return json(route, { list: { id: LIST_A, title: "Liste A lente", description: "Réponse différée", currency: "EUR" }, items: [] });
    }
    if (path === "lists/" + LIST_B && method === "GET") {
      return json(route, { list: { id: LIST_B, title: "Liste B choisie", description: "Réponse rapide", currency: "EUR" }, items: [] });
    }
    return json(route, { error: "Route de test non simulée : " + method + " " + path }, 501);
  });

  await page.goto("/index.html");
  await page.getByLabel("Adresse e-mail").fill("race@example.test");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-test-123");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.locator("#appView")).toBeVisible();
  const listBButton = page.locator("#lists button").filter({ hasText: "Liste B choisie" });
  await expect(listBButton).toBeVisible();
  await listBButton.click();

  await expect(page.getByRole("heading", { name: "Liste B choisie" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Liste B choisie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste A lente" })).toHaveCount(0);
  expect(calls.filter(call => call.method === "GET" && call.path.startsWith("lists/")).length).toBeGreaterThanOrEqual(2);
});
