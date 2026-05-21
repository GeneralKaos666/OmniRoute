import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { featureFlagUpdateSchema } from "@/shared/validation/settingsSchemas";
import { resolveAllFeatureFlags } from "@/shared/utils/featureFlags";
import {
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  clearAllFeatureFlagOverrides,
} from "@/lib/localDb";
import { FEATURE_FLAG_DEFINITIONS } from "@/shared/constants/featureFlagDefinitions";
import log from "@/shared/utils/logger";

export async function GET(req: NextRequest) {
  const authResponse = await requireManagementAuth(req);
  if (authResponse) return authResponse;

  const flags = resolveAllFeatureFlags();
  const summary = {
    total: flags.length,
    active: flags.filter(
      (f) =>
        f.effectiveValue === "true" ||
        f.effectiveValue === "1" ||
        f.effectiveValue === "yes" ||
        (f.definition.type === "enum" &&
          f.effectiveValue !== "off" &&
          f.effectiveValue !== "disabled")
    ).length,
    inactive: flags.filter(
      (f) =>
        f.effectiveValue === "false" ||
        f.effectiveValue === "0" ||
        f.effectiveValue === "no" ||
        f.effectiveValue === "off" ||
        f.effectiveValue === "disabled"
    ).length,
    overriddenByDb: flags.filter((f) => f.source === "db").length,
    overriddenByEnv: flags.filter((f) => f.source === "env").length,
  };

  return NextResponse.json({ flags, summary });
}

export async function PUT(req: NextRequest) {
  const authResponse = await requireManagementAuth(req);
  if (authResponse) return authResponse;

  try {
    const body = await req.json();
    const parsed = featureFlagUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { key, value } = parsed.data;

    const definition = FEATURE_FLAG_DEFINITIONS.find((d) => d.key === key);
    if (!definition) {
      return NextResponse.json({ error: `Unknown feature flag: ${key}` }, { status: 400 });
    }

    if (value !== undefined) {
      // Validate enum types
      if (
        definition.type === "enum" &&
        definition.enumValues &&
        !definition.enumValues.includes(value)
      ) {
        return NextResponse.json(
          {
            error: `Invalid value for ${key}. Allowed values: ${definition.enumValues.join(", ")}`,
          },
          { status: 400 }
        );
      }
      setFeatureFlagOverride(key, value);
      log.info(`[Feature Flags] Override SET for ${key} = ${value}`);
    } else {
      removeFeatureFlagOverride(key);
      log.info(`[Feature Flags] Override REMOVED for ${key}`);
    }

    // Recalculate effective value
    const allFlags = resolveAllFeatureFlags();
    const updatedFlag = allFlags.find((f) => f.key === key);

    return NextResponse.json({
      key,
      effectiveValue: updatedFlag?.effectiveValue,
      source: updatedFlag?.source,
      requiresRestart: definition.requiresRestart,
    });
  } catch (error: any) {
    log.error(`[Feature Flags] Failed to update: ${error.message}`);
    return NextResponse.json({ error: "Failed to update feature flag" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResponse = await requireManagementAuth(req);
  if (authResponse) return authResponse;

  try {
    clearAllFeatureFlagOverrides();
    log.info("[Feature Flags] ALL overrides cleared");
    return NextResponse.json({
      cleared: FEATURE_FLAG_DEFINITIONS.length,
      message: "All feature flag overrides cleared",
    });
  } catch (error: any) {
    log.error(`[Feature Flags] Failed to clear overrides: ${error.message}`);
    return NextResponse.json({ error: "Failed to clear feature flags" }, { status: 500 });
  }
}
