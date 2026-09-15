import type { SQLiteDatabase } from 'expo-sqlite'

/** Generic key/value store — see migrations/0003_app_setting.ts. */
export class AppSettingRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_setting WHERE key = ?;`,
      key,
    )
    return row?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_setting (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      key,
      value,
    )
  }
}
