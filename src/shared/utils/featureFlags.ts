import { getFeatureFlagOverride, getFeatureFlagOverrides } from "@/lib/db/featureFlags";
import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagDefinition,
} from "@/shared/constants/featureFlagDefinitions";

/**
 * Resolve the effective value of a feature flag.
 * Priority: DB override > process.env > definition.defaultValue
 */
export function resolveFeatureFlag(key: string): string {
  // 1. Check DB override
  const dbOverride = getFeatureFlagOverride(key);
  if (dbOverride !== undefined) return dbOverride;

  // 2. Check environment variable
  const envValue = process.env[key];
  if (envValue !== undefined && envValue !== "") return envValue;

  // 3. Fall back to default from definition
  const definition = FEATURE_FLAG_DEFINITIONS.find((d) => d.key === key);
  return definition?.defaultValue ?? "false";
}

/**
 * Check if a boolean feature flag is enabled.
 * Treats "true", "1", "yes" as enabled.
 */
export function isFeatureFlagEnabled(key: string): boolean {
  const value = resolveFeatureFlag(key);
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Resolve all feature flags with their effective values and sources.
 * Used by the API route to populate the UI.
 */
export function resolveAllFeatureFlags(): Array<{
  key: string;
  effectiveValue: string;
  source: "db" | "env" | "default";
  definition: FeatureFlagDefinition;
}> {
  const overrides = getFeatureFlagOverrides();
  return FEATURE_FLAG_DEFINITIONS.map((def) => {
    let source: "db" | "env" | "default" = "default";
    let effectiveValue = def.defaultValue;

    const envValue = process.env[def.key];
    if (envValue !== undefined && envValue !== "") {
      effectiveValue = envValue;
      source = "env";
    }

    const dbOverride = overrides[def.key];
    if (dbOverride !== undefined) {
      effectiveValue = dbOverride;
      source = "db";
    }

    return {
      key: def.key,
      effectiveValue,
      source,
      definition: def,
    };
  });
}

// ── Convenience wrappers (backward compatible) ──────────────────
export function isCcCompatibleProviderEnabled(): boolean {
  return isFeatureFlagEnabled("ENABLE_CC_COMPATIBLE_PROVIDER");
}
