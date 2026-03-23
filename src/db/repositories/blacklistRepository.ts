import type { Database } from "bun:sqlite";

export interface BlacklistEntry {
  addedBy: string;
  createdAt: number;
  userId: string;
}

export interface BlacklistRepository {
  add(userId: string, addedBy: string): BlacklistEntry;
  has(userId: string): boolean;
  list(): BlacklistEntry[];
  remove(userId: string): boolean;
}

interface Row {
  added_by: string;
  created_at: number;
  user_id: string;
}

function mapRow(row: Row): BlacklistEntry {
  return {
    userId: row.user_id,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

export function createBlacklistRepository(database: Database): BlacklistRepository {
  const insert = database.query<Row, [string, string]>(`
    INSERT INTO blacklist (user_id, added_by)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO NOTHING
    RETURNING user_id, added_by, created_at
  `);
  const selectOne = database.query<Row, [string]>(`
    SELECT user_id, added_by, created_at
    FROM blacklist
    WHERE user_id = ?
    LIMIT 1
  `);
  const remove = database.query(`
    DELETE FROM blacklist
    WHERE user_id = ?
  `);
  const list = database.query<Row, []>(`
    SELECT user_id, added_by, created_at
    FROM blacklist
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
        throw new Error(`Failed to add blacklist entry for ${userId}`);
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
