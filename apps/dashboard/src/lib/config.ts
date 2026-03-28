import type { ConfigGroup, ConfigRecord } from "@agentic/shared";
import { pool } from "./db";
import { SENSITIVE_KEYS, encrypt, decrypt } from "./crypto";

export async function isConfigured(): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM agent_config"
  );
  return parseInt(result.rows[0]?.count ?? "0", 10) > 0;
}

export async function readConfig(group?: ConfigGroup): Promise<ConfigRecord[]> {
  const encKey = process.env.ENCRYPTION_KEY;
  const query = group
    ? "SELECT key, value, encrypted, group_name, updated_at FROM agent_config WHERE group_name = $1 ORDER BY key"
    : "SELECT key, value, encrypted, group_name, updated_at FROM agent_config ORDER BY key";
  const params = group ? [group] : [];
  const result = await pool.query<{
    key: string;
    value: string;
    encrypted: boolean;
    group_name: string;
    updated_at: Date;
  }>(query, params);

  return result.rows.map((row) => {
    let value = row.value;
    if (row.encrypted && encKey) {
      try {
        value = decrypt(value, encKey);
      } catch {
        value = "";
      }
    }
    return {
      key: row.key,
      value,
      encrypted: row.encrypted,
      groupName: row.group_name as ConfigGroup,
      updatedAt: row.updated_at,
    };
  });
}

export async function writeConfig(
  records: Array<{
    key: string;
    value: string;
    group: ConfigGroup;
    sensitive?: boolean;
  }>
): Promise<void> {
  const encKey = process.env.ENCRYPTION_KEY;
  const client = await (await import("./db")).getPool().connect();
  try {
    await client.query("BEGIN");
    for (const record of records) {
      const sensitive = record.sensitive ?? SENSITIVE_KEYS.has(record.key);
      let value = record.value;
      const actuallyEncrypted = sensitive && !!encKey && !!value;
      if (actuallyEncrypted) {
        value = encrypt(value, encKey!);
      }
      await client.query(
        `INSERT INTO agent_config (key, value, encrypted, group_name, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               encrypted = EXCLUDED.encrypted,
               group_name = EXCLUDED.group_name,
               updated_at = NOW()`,
        [record.key, value, actuallyEncrypted, record.group]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(key) && value) return "••••••••";
  return value;
}
