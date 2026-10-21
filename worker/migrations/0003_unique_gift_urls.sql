CREATE UNIQUE INDEX IF NOT EXISTS idx_items_list_url_unique
ON wishlist_items(wishlist_id, url)
WHERE url IS NOT NULL;
