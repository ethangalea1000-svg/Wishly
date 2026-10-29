import { env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";
import initialSchema from "../migrations/0001_initial.sql?raw";
import sharingSchema from "../migrations/0002_sharing_reservations.sql?raw";
import uniqueGiftUrls from "../migrations/0003_unique_gift_urls.sql?raw";

beforeAll(async () => {
  await env.DB.exec(initialSchema);
  await env.DB.exec(sharingSchema);
  await env.DB.exec(uniqueGiftUrls);
});

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM audit_events; DELETE FROM reservations; DELETE FROM wishlist_items; " +
    "DELETE FROM wishlists; DELETE FROM sessions; DELETE FROM users; DELETE FROM rate_limits;"
  );
});
