import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCoverageBadge, writePagesBadges } from "./pages-badge-utils.mjs";

test("createCoverageBadge renders line coverage from a Test Station report", () => {
  const badge = createCoverageBadge({
    summary: {
      coverage: {
        lines: { pct: 73.94 },
      },
    },
  });

  assert.deepEqual(badge, {
    schemaVersion: 1,
    label: "coverage",
    message: "73.94%",
    color: "yellowgreen",
  });
});

test("createCoverageBadge handles reports without coverage", () => {
  assert.deepEqual(createCoverageBadge({ summary: { coverage: null } }), {
    schemaVersion: 1,
    label: "coverage",
    message: "n/a",
    color: "lightgrey",
  });
});

test("writePagesBadges creates a Shields endpoint beside the exported site", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "m68k-pages-badges-"));

  writePagesBadges({
    report: { summary: { coverage: { lines: { pct: 91 } } } },
    outputDir,
  });

  const badge = JSON.parse(fs.readFileSync(path.join(outputDir, "coverage.json"), "utf8"));
  assert.equal(badge.message, "91%");
  assert.equal(badge.color, "brightgreen");
});
