from pathlib import Path
import sqlite3

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"

def main():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    files = sorted(MIGRATIONS.glob("*.sql"))
    assert len(files) >= 2, f"Expected at least two migrations, got {len(files)}"
    for migration in files:
        db.executescript(migration.read_text(encoding="utf-8"))

    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for required in {"users", "sessions", "wishlists", "wishlist_items", "reservations", "audit_events", "rate_limits"}:
        assert required in tables, f"Missing table: {required}"

    wishlist_columns = {row[1] for row in db.execute("PRAGMA table_info(wishlists)")}
    reservation_columns = {row[1] for row in db.execute("PRAGMA table_info(reservations)")}
    assert "share_token" in wishlist_columns
    assert "cancel_token_hash" in reservation_columns

    db.execute(
        "INSERT INTO users(id,email,display_name,password_hash,password_salt,password_iterations) VALUES(?,?,?,?,?,?)",
        ("u1", "test@example.invalid", "Test", "hash", "salt", 310000),
    )
    db.execute("INSERT INTO wishlists(id,owner_id,title) VALUES(?,?,?)", ("l1", "u1", "Test list"))
    try:
        db.execute("INSERT INTO wishlist_items(id,wishlist_id,title,quantity) VALUES(?,?,?,?)", ("i-bad", "l1", "Bad", 0))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Quantity constraint did not reject zero")

    db.execute("INSERT INTO wishlist_items(id,wishlist_id,title,quantity) VALUES(?,?,?,?)", ("i1", "l1", "Gift", 1))
    db.execute("UPDATE wishlists SET share_token=? WHERE id=?", ("a" * 64, "l1"))
    try:
        db.execute("UPDATE wishlists SET share_token=? WHERE id=?", ("a" * 64, "l1"))
    except sqlite3.IntegrityError:
        raise AssertionError("Updating the same unique token should not fail")
    print(f"Validated {len(files)} migrations and core schema constraints.")

if __name__ == "__main__":
    main()
