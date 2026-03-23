import type { Database } from "bun:sqlite";

export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      user_id TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_blacklist_created_at
      ON blacklist (created_at DESC);
  `);
}
