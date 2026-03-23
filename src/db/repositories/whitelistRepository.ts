import type { Database } from "bun:sqlite";

export interface WhitelistEntry {
  addedBy: string;
  createdAt: number;
  userId: string;
}

export interface WhitelistRepository {
  add(userId: string, addedBy: string): WhitelistEntry;
  has(userId: string): boolean;
  list(): WhitelistEntry[];
  remove(userId: string): boolean;
}

interface Row {
  added_by: string;
  created_at: number;
  user_id: string;
}

function mapRow(row: Row): WhitelistEntry {
  return {
    userId: row.user_id,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

export function createWhitelistRepository(database: Database): WhitelistRepository {
  const insert = database.query<Row, [string, string]>(`
    INSERT INTO whitelist (user_id, added_by)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO NOTHING
    RETURNING user_id, added_by, created_at
  `);
  const selectOne = database.query<Row, [string]>(`
    SELECT user_id, added_by, created_at
    FROM whitelist
    WHERE user_id = ?
    LIMIT 1
  `);
  const remove = database.query(`
    DELETE FROM whitelist
    WHERE user_id = ?
  `);
  const list = database.query<Row, []>(`
    SELECT user_id, added_by, created_at
    FROM whitelist
    ORDER BY created_at DESC, user_id ASC
  `);

  return {
    add(userId, addedBy) {
      const inserted = insert.get(userId, addedBy);
      if (inserted) {
        return mapRow(inserted);
      }

      const existing = selectOne.get(userId);
      if (!existing) {
        throw new Error(`Failed to add whitelist entry for ${userId}`);
      }
      return mapRow(existing);
    },
    remove(userId) {
      const result = remove.run(userId);
      return result.changes > 0;
    },
    has(userId) {
      return Boolean(selectOne.get(userId));
    },
    list() {
      return list.all().map(mapRow);
    },
  };
}
