import { getDbInstance } from "./core.js";

const NAMESPACE = "feature_flags";

export function getFeatureFlagOverrides(): Record<string, string> {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT key, value FROM key_value WHERE namespace = ?")
    .all(NAMESPACE) as { key: string; value: string }[];

  const overrides: Record<string, string> = {};
  for (const row of rows) {
    overrides[row.key] = row.value;
  }
  return overrides;
}

export function getFeatureFlagOverride(key: string): string | undefined {
  const db = getDbInstance();
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
    .get(NAMESPACE, key) as { value: string } | undefined;

  return row?.value;
}

export function setFeatureFlagOverride(key: string, value: string): void {
  const db = getDbInstance();
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
    NAMESPACE,
    key,
    value
  );
}

export function removeFeatureFlagOverride(key: string): void {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run(NAMESPACE, key);
}

export function clearAllFeatureFlagOverrides(): void {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = ?").run(NAMESPACE);
}
