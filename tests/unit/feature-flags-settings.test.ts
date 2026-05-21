import { describe, test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FEATURE_FLAG_DEFINITIONS } from "../../src/shared/constants/featureFlagDefinitions.ts";

async function createFeatureFlagsHarness() {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-feature-flags-"));
  process.env.DATA_DIR = testDataDir;
  process.env.REQUIRE_API_KEY = "false";
  if (!process.env.API_KEY_SECRET) {
    process.env.API_KEY_SECRET = "test-settings-api-secret-" + Date.now();
  }

  const core = await import("../../src/lib/db/core.ts");
  const featureFlagsDb = await import("../../src/lib/localDb.ts");
  const featureFlagsResolver = await import("../../src/shared/utils/featureFlags.ts");
  const featureFlagsRoute = await import("../../src/app/api/settings/feature-flags/route.ts");

  async function resetStorage() {
    core.resetDbInstance();
    fs.rmSync(testDataDir, { recursive: true, force: true });
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  function cleanup() {
    core.resetDbInstance();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  return {
    testDataDir,
    core,
    featureFlagsDb,
    featureFlagsResolver,
    featureFlagsRoute,
    resetStorage,
    cleanup,
  };
}

const harness = await createFeatureFlagsHarness();
import { makeManagementSessionRequest } from "../helpers/managementSession.ts";

// Helper to set env vars for testing
function withEnv(key: string, value: string, fn: () => void) {
  const original = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

beforeEach(async () => {
  await harness.resetStorage();
});

afterEach(async () => {
  await harness.resetStorage();
});

after(() => {
  harness.cleanup();
});

describe("Feature Flags Unit Tests", () => {
  describe("featureFlagDefinitions", () => {
    test("should have exactly 25 flag definitions", () => {
      assert.strictEqual(FEATURE_FLAG_DEFINITIONS.length, 25);
    });

    test("should have unique keys for all flags", () => {
      const keys = FEATURE_FLAG_DEFINITIONS.map((d) => d.key);
      const uniqueKeys = new Set(keys);
      assert.strictEqual(keys.length, uniqueKeys.size);
    });

    test("should have valid categories for all flags", () => {
      const validCategories = [
        "routing",
        "security",
        "resilience",
        "policies",
        "runtime",
        "cli",
        "health",
        "network",
      ];
      for (const flag of FEATURE_FLAG_DEFINITIONS) {
        assert.ok(validCategories.includes(flag.category), `Invalid category: ${flag.category}`);
      }
    });

    test("should have valid types (boolean or enum) for all flags", () => {
      for (const flag of FEATURE_FLAG_DEFINITIONS) {
        assert.ok(["boolean", "enum"].includes(flag.type), `Invalid type: ${flag.type}`);
      }
    });

    test("should have enumValues for all enum-type flags", () => {
      for (const flag of FEATURE_FLAG_DEFINITIONS) {
        if (flag.type === "enum") {
          assert.ok(Array.isArray(flag.enumValues));
          assert.ok(flag.enumValues.length > 0);
        }
      }
    });

    test("should not have enumValues for boolean-type flags", () => {
      for (const flag of FEATURE_FLAG_DEFINITIONS) {
        if (flag.type === "boolean") {
          assert.strictEqual(flag.enumValues, undefined);
        }
      }
    });

    test("should have a warningLevel only with valid values", () => {
      for (const flag of FEATURE_FLAG_DEFINITIONS) {
        if (flag.warningLevel) {
          assert.ok(["info", "caution", "danger"].includes(flag.warningLevel));
        }
      }
    });
  });

  describe("featureFlags DB module", () => {
    test("getFeatureFlagOverrides returns empty object when no overrides", () => {
      const overrides = harness.featureFlagsDb.getFeatureFlagOverrides();
      assert.deepStrictEqual(overrides, {});
    });

    test("setFeatureFlagOverride stores value in key_value table", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "true");
      const override = harness.featureFlagsDb.getFeatureFlagOverride("CLI_COMPAT_ALL");
      assert.strictEqual(override, "true");
    });

    test("getFeatureFlagOverride returns the stored value", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("ENABLE_OAUTH", "false");
      const override = harness.featureFlagsDb.getFeatureFlagOverride("ENABLE_OAUTH");
      assert.strictEqual(override, "false");
    });

    test("getFeatureFlagOverride returns undefined for unset flag", () => {
      const override = harness.featureFlagsDb.getFeatureFlagOverride("NON_EXISTENT_FLAG");
      assert.strictEqual(override, undefined);
    });

    test("removeFeatureFlagOverride deletes the override", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "true");
      harness.featureFlagsDb.removeFeatureFlagOverride("CLI_COMPAT_ALL");
      const override = harness.featureFlagsDb.getFeatureFlagOverride("CLI_COMPAT_ALL");
      assert.strictEqual(override, undefined);
    });

    test("clearAllFeatureFlagOverrides removes all overrides", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "true");
      harness.featureFlagsDb.setFeatureFlagOverride("ENABLE_OAUTH", "false");
      harness.featureFlagsDb.clearAllFeatureFlagOverrides();
      const overrides = harness.featureFlagsDb.getFeatureFlagOverrides();
      assert.deepStrictEqual(overrides, {});
    });

    test("setFeatureFlagOverride overwrites existing value", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "true");
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "false");
      const override = harness.featureFlagsDb.getFeatureFlagOverride("CLI_COMPAT_ALL");
      assert.strictEqual(override, "false");
    });
  });

  describe("resolveFeatureFlag", () => {
    test("returns DB override when set", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "false");
      const val = harness.featureFlagsResolver.resolveFeatureFlag("CLI_COMPAT_ALL");
      assert.strictEqual(val, "false");
    });

    test("falls back to ENV when no DB override", () => {
      withEnv("CLI_COMPAT_ALL", "env_value", () => {
        const val = harness.featureFlagsResolver.resolveFeatureFlag("CLI_COMPAT_ALL");
        assert.strictEqual(val, "env_value");
      });
    });

    test("falls back to default when neither DB nor ENV", () => {
      withEnv("CLI_COMPAT_ALL", "", () => {
        const val = harness.featureFlagsResolver.resolveFeatureFlag("CLI_COMPAT_ALL");
        assert.strictEqual(val, "0"); // Default is "0" for CLI_COMPAT_ALL
      });
    });

    test("DB takes priority over ENV", () => {
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "db_value");
      withEnv("CLI_COMPAT_ALL", "env_value", () => {
        const val = harness.featureFlagsResolver.resolveFeatureFlag("CLI_COMPAT_ALL");
        assert.strictEqual(val, "db_value");
      });
    });

    test("handles boolean truthy values: true, 1, yes", () => {
      withEnv("CLI_COMPAT_ALL", "true", () =>
        assert.strictEqual(
          harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
          true
        )
      );
      withEnv("CLI_COMPAT_ALL", "1", () =>
        assert.strictEqual(
          harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
          true
        )
      );
      withEnv("CLI_COMPAT_ALL", "yes", () =>
        assert.strictEqual(
          harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
          true
        )
      );
    });

    describe("isFeatureFlagEnabled", () => {
      test("returns true for 'true'", () =>
        withEnv("CLI_COMPAT_ALL", "true", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            true
          )
        ));
      test("returns true for '1'", () =>
        withEnv("CLI_COMPAT_ALL", "1", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            true
          )
        ));
      test("returns true for 'yes'", () =>
        withEnv("CLI_COMPAT_ALL", "yes", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            true
          )
        ));
      test("returns false for 'false'", () =>
        withEnv("CLI_COMPAT_ALL", "false", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            false
          )
        ));
      test("returns false for '0'", () =>
        withEnv("CLI_COMPAT_ALL", "0", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            false
          )
        ));
      // Note: "" defaults to "off" for CLI_COMPAT_ALL
      test("returns false for empty string", () =>
        withEnv("CLI_COMPAT_ALL", "", () =>
          assert.strictEqual(
            harness.featureFlagsResolver.isFeatureFlagEnabled("CLI_COMPAT_ALL"),
            false
          )
        ));
    });

    describe("resolveAllFeatureFlags", () => {
      test("returns all 25 flags with correct source", () => {
        const flags = harness.featureFlagsResolver.resolveAllFeatureFlags();
        assert.strictEqual(flags.length, 25);
      });

      test("marks DB-overridden flags with source 'db'", () => {
        harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "false");
        const flags = harness.featureFlagsResolver.resolveAllFeatureFlags();
        const cliFlag = flags.find((f: any) => f.key === "CLI_COMPAT_ALL");
        assert.strictEqual(cliFlag?.source, "db");
      });

      test("marks ENV-set flags with source 'env'", () => {
        withEnv("CLI_COMPAT_ALL", "false", () => {
          const flags = harness.featureFlagsResolver.resolveAllFeatureFlags();
          const cliFlag = flags.find((f: any) => f.key === "CLI_COMPAT_ALL");
          assert.strictEqual(cliFlag?.source, "env");
        });
      });

      test("marks default flags with source 'default'", () => {
        withEnv("CLI_COMPAT_ALL", "", () => {
          const flags = harness.featureFlagsResolver.resolveAllFeatureFlags();
          const cliFlag = flags.find((f: any) => f.key === "CLI_COMPAT_ALL");
          assert.strictEqual(cliFlag?.source, "default");
        });
      });
    });

    describe("backward compatibility", () => {
      test("isCcCompatibleProviderEnabled still works", () => {
        withEnv("ENABLE_CC_COMPATIBLE_PROVIDER", "true", () => {
          assert.strictEqual(harness.featureFlagsResolver.isCcCompatibleProviderEnabled(), true);
        });
        withEnv("ENABLE_CC_COMPATIBLE_PROVIDER", "false", () => {
          assert.strictEqual(harness.featureFlagsResolver.isCcCompatibleProviderEnabled(), false);
        });
      });
    });
  });

  describe("PUT /api/settings/feature-flags", () => {
    test("rejects unknown flag keys", async () => {
      const req = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "NON_EXISTENT_FLAG", value: "true" },
        }
      );
      const res = await harness.featureFlagsRoute.PUT(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error, "Unknown feature flag: NON_EXISTENT_FLAG");
    });

    test("rejects invalid enum values for enum-type flags", async () => {
      const req = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "INJECTION_GUARD_MODE", value: "invalid_value" },
        }
      );
      const res = await harness.featureFlagsRoute.PUT(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error.includes("Invalid value for INJECTION_GUARD_MODE"));
    });

    test("accepts valid boolean values for boolean flags", async () => {
      const req = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "CLI_COMPAT_ALL", value: "false" },
        }
      );
      const res = await harness.featureFlagsRoute.PUT(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.effectiveValue, "false");
    });

    test("removes override when value is omitted", async () => {
      // First set it
      harness.featureFlagsDb.setFeatureFlagOverride("CLI_COMPAT_ALL", "false");

      // Then remove it
      const req = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "CLI_COMPAT_ALL" },
        }
      );
      const res = await harness.featureFlagsRoute.PUT(req);
      assert.strictEqual(res.status, 200);

      const val = harness.featureFlagsDb.getFeatureFlagOverride("CLI_COMPAT_ALL");
      assert.strictEqual(val, undefined);
    });

    test("returns requiresRestart hint", async () => {
      const req = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "CLI_COMPAT_ALL", value: "false" },
        }
      );
      const res = await harness.featureFlagsRoute.PUT(req);
      const json = await res.json();
      // CLI_COMPAT_ALL is requiresRestart: undefined/false in our definitions
      assert.strictEqual(json.requiresRestart || false, false);

      // Try one that requires restart
      const req2 = await makeManagementSessionRequest(
        "http://localhost/api/settings/feature-flags",
        {
          method: "PUT",
          body: { key: "ENABLE_TLS_FINGERPRINT", value: "false" },
        }
      );
      const res2 = await harness.featureFlagsRoute.PUT(req2);
      const json2 = await res2.json();
      // ENABLE_TLS_FINGERPRINT requires restart
      assert.strictEqual(json2.requiresRestart, true);
    });
  });
});
