/**
 * Regression guard for #3363 — Kiro auto-import failed on Windows because
 * tryKiroCliSqlite() only probed the Linux/macOS path
 * (~/.local/share/kiro-cli/data.sqlite3) and never checked the Kiro IDE
 * path that Windows users have: %APPDATA%\kiro\storage.db
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import the GET handler at the module level so the DB is initialised once
// before any test runs. The route is auth-guarded but isAuthRequired() returns
// false for loopback requests that have no password configured (default dev /
// test environment), so a plain Request to http://localhost/... goes straight
// through to the credential-detection logic.
const { GET } = await import("../../src/app/api/oauth/kiro/auto-import/route.ts");

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_APPDATA = process.env.APPDATA;

let tmpHome: string;

test.beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-kiro-3363-"));
  // Override HOME so homedir() returns a temp dir where no kiro-cli DB exists.
  process.env.HOME = tmpHome;
  // Ensure APPDATA is unset by default; individual tests that need it set it.
  delete process.env.APPDATA;
});

test.afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_APPDATA !== undefined) {
    process.env.APPDATA = ORIGINAL_APPDATA;
  } else {
    delete process.env.APPDATA;
  }
  if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
});

// Helper to call the GET handler and parse the JSON body.
async function callGet(): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request("http://localhost/api/oauth/kiro/auto-import");
  const response = await GET(request);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

test("triedPaths includes the Windows APPDATA path when process.env.APPDATA is set", async () => {
  // Simulate a Windows environment with %APPDATA% pointing to a temp dir.
  // The storage.db file does not exist there, so the probe fails gracefully.
  process.env.APPDATA = tmpHome;

  const { body } = await callGet();

  assert.equal(body.found, false, "credentials must not be found when both DB files are absent");
  assert.ok(Array.isArray(body.triedPaths), "triedPaths must be an array");

  const expectedWindowsPath = path.join(tmpHome, "kiro", "storage.db");
  assert.ok(
    (body.triedPaths as string[]).includes(expectedWindowsPath),
    `triedPaths must include the Windows APPDATA path ${expectedWindowsPath}, got: ${JSON.stringify(body.triedPaths)}`
  );
});

test("triedPaths does NOT include any Windows path when process.env.APPDATA is not set", async () => {
  // APPDATA is already unset by beforeEach.
  const { body } = await callGet();

  assert.equal(body.found, false, "credentials must not be found when DB file is absent");
  assert.ok(Array.isArray(body.triedPaths), "triedPaths must be an array");

  const paths = body.triedPaths as string[];

  // No path should reference "kiro/storage.db" (the Windows IDE storage path).
  const hasWindowsPath = paths.some(
    (p) => p.includes("storage.db") && p.includes("kiro")
  );
  assert.equal(
    hasWindowsPath,
    false,
    `triedPaths must not include any Windows kiro/storage.db path when APPDATA is unset, got: ${JSON.stringify(paths)}`
  );
});

test("triedPaths always includes the Linux/macOS kiro-cli path", async () => {
  const { body } = await callGet();

  assert.ok(Array.isArray(body.triedPaths), "triedPaths must be an array");

  const expectedLinuxPath = path.join(tmpHome, ".local/share/kiro-cli/data.sqlite3");
  assert.ok(
    (body.triedPaths as string[]).includes(expectedLinuxPath),
    `triedPaths must always include the Linux/macOS kiro-cli path ${expectedLinuxPath}, got: ${JSON.stringify(body.triedPaths)}`
  );
});
