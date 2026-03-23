import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });

  const database = new Database(path, { create: true, strict: true });
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}
