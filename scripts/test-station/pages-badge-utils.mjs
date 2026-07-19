import fs from "node:fs";
import path from "node:path";

export function createCoverageBadge(report) {
  const percentage = report?.summary?.coverage?.lines?.pct;
  if (!Number.isFinite(percentage)) {
    return createBadge("coverage", "n/a", "lightgrey");
  }

  return createBadge("coverage", `${percentage}%`, coverageColor(percentage));
}

export function writePagesBadges({ report, outputDir }) {
  const resolvedOutputDir = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.writeFileSync(
    path.join(resolvedOutputDir, "coverage.json"),
    `${JSON.stringify(createCoverageBadge(report), null, 2)}\n`
  );
}

function createBadge(label, message, color) {
  return {
    schemaVersion: 1,
    label,
    message,
    color,
  };
}

function coverageColor(percentage) {
  if (percentage >= 90) return "brightgreen";
  if (percentage >= 80) return "green";
  if (percentage >= 70) return "yellowgreen";
  if (percentage >= 60) return "yellow";
  if (percentage >= 50) return "orange";
  return "red";
}
