import type { Database } from "bun:sqlite";

export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS whitelist (
      user_id TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_whitelist_created_at
      ON whitelist (created_at DESC);
  `);
}
