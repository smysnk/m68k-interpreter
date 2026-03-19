import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertRequiredCiMetadata, createIngestPayload } from "./ingest-report-utils.mjs";

test("createIngestPayload honors explicit Test Station metadata overrides", () => {
  const fixture = createFixtureWorkspace();

  const payload = createIngestPayload({
    reportPath: fixture.reportPath,
    projectKey: "m68k-interpreter",
    cwd: fixture.rootDir,
    env: {
      TEST_STATION_BRANCH: "feature/retro-display",
      TEST_STATION_BUILD_NUMBER: "77",
      TEST_STATION_COMMIT_SHA: "def456",
      TEST_STATION_REPOSITORY: "smysnk/m68k-interpreter",
      TEST_STATION_REPOSITORY_URL: "https://github.com/smysnk/m68k-interpreter",
      TEST_STATION_SOURCE_PROVIDER: "github-actions",
      TEST_STATION_SOURCE_RUN_ID: "1337",
    },
  });

  assert.equal(payload.source.provider, "github-actions");
  assert.equal(payload.source.runId, "1337");
  assert.equal(payload.source.branch, "feature/retro-display");
  assert.equal(payload.source.buildNumber, 77);
  assert.equal(payload.source.commitSha, "def456");
  assert.equal(payload.source.repository, "smysnk/m68k-interpreter");
  assert.equal(payload.source.repositoryUrl, "https://github.com/smysnk/m68k-interpreter");
});

test("createIngestPayload falls back to local git metadata when CI env is absent", () => {
  const fixture = createFixtureWorkspace();

  execFileSync("git", ["init", "-b", "feature/local-publish"], { cwd: fixture.rootDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Codex"], { cwd: fixture.rootDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: fixture.rootDir, stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:smysnk/m68k-interpreter.git"], {
    cwd: fixture.rootDir,
    stdio: "ignore",
  });
  fs.writeFileSync(path.join(fixture.rootDir, "README.md"), "fixture\n");
  execFileSync("git", ["add", "."], { cwd: fixture.rootDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Fixture"], { cwd: fixture.rootDir, stdio: "ignore" });

  const payload = createIngestPayload({
    reportPath: fixture.reportPath,
    projectKey: "m68k-interpreter",
    cwd: fixture.rootDir,
    env: {},
  });

  assert.equal(payload.source.provider, "local-cli");
  assert.equal(payload.source.branch, "feature/local-publish");
  assert.equal(payload.source.buildNumber, null);
  assert.match(payload.source.commitSha || "", /^[0-9a-f]{40}$/);
  assert.equal(payload.source.repository, "smysnk/m68k-interpreter");
  assert.equal(payload.source.repositoryUrl, "https://github.com/smysnk/m68k-interpreter");
});

test("assertRequiredCiMetadata accepts GitHub Actions payloads with branch and build", () => {
  assert.doesNotThrow(() =>
    assertRequiredCiMetadata({
      provider: "github-actions",
      branch: "main",
      buildNumber: 1,
    })
  );
});

test("assertRequiredCiMetadata rejects incomplete GitHub Actions payloads", () => {
  assert.throws(
    () =>
      assertRequiredCiMetadata({
        provider: "github-actions",
        branch: null,
        buildNumber: null,
      }),
    /Missing required GitHub Actions source metadata: branch, buildNumber/
  );
});

function createFixtureWorkspace() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "m68k-interpreter-test-station-"));
  const outputDir = path.join(rootDir, ".test-results", "test-station");
  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    schemaVersion: "1",
    generatedAt: "2026-03-17T12:00:00.000Z",
    summary: {
      totalPackages: 1,
      totalSuites: 1,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
    },
    packages: [],
    modules: [],
    meta: {
      projectName: "m68k-interpreter",
    },
  };

  const reportPath = path.join(outputDir, "report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return {
    rootDir,
    reportPath,
  };
}
