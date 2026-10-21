PRAGMA foreign_keys = ON;

ALTER TABLE wishlists ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_share_token ON wishlists(share_token) WHERE share_token IS NOT NULL;
ALTER TABLE reservations ADD COLUMN cancel_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_reservations_cancel_hash ON reservations(cancel_token_hash);
