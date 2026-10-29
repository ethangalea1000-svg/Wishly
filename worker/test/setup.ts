import { env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";
import initialSchema from "../migrations/0001_initial.sql?raw";
import sharingSchema from "../migrations/0002_sharing_reservations.sql?raw";
import uniqueGiftUrls from "../migrations/0003_unique_gift_urls.sql?raw";

async function runSqlScript(script: string) {
  const statements = script
    .split(";")
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0 && !/^PRAGMA\s+foreign_keys\s*=\s*ON$/i.test(statement));
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  await runSqlScript(initialSchema);
  await runSqlScript(sharingSchema);
  await runSqlScript(uniqueGiftUrls);
});

beforeEach(async () => {
  await runSqlScript(
    "DELETE FROM audit_events; DELETE FROM reservations; DELETE FROM wishlist_items; " +
    "DELETE FROM wishlists; DELETE FROM sessions; DELETE FROM users; DELETE FROM rate_limits;"
  );
});
