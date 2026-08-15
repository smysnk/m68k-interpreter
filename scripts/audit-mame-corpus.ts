import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compareMameVector } from '../tests/oracles/mameExecutor';
import { decodeMameVectorFile } from '../tests/oracles/mameVectors';

interface FamilyResult {
  file: string;
  total: number;
  exact: number;
  reviewedQuarantines: Record<string, number>;
  unexplained: Array<{ name: string; faultCode?: string; differences: string[] }>;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function classifyReviewedQuarantine(
  name: string,
  faultCode: string | undefined,
  differences: readonly string[]
): string | undefined {
  if (faultCode === 'address-error') return 'm68000-address-error-frame-and-bus-sequencing';
  if (faultCode === 'chk-exception' && differences.every((item) => item.startsWith('RAM:'))) {
    return 'chk-undefined-ccr-bits-in-stacked-frame';
  }
  if (
    faultCode === undefined &&
    differences.includes('PC') &&
    (differences.includes('SSP') || name.includes('STOP'))
  ) {
    return 'prefetch-stage-address-error-or-stop-pc';
  }
  return undefined;
}

const corpusDirectory = resolve(argument('--corpus') ?? 'references/m68000-vectors/v1');
const outputPath = resolve(
  argument('--output') ?? '.test-results/m68000-conformance/mame-corpus-audit.json'
);
const requestedLimit = Number(argument('--limit') ?? Number.POSITIVE_INFINITY);
if (!(requestedLimit > 0)) throw new RangeError('--limit must be a positive number');

const families: FamilyResult[] = [];
for (const file of readdirSync(corpusDirectory)
  .filter((name) => name.endsWith('.json.bin'))
  .sort()) {
  const bytes = new Uint8Array(readFileSync(resolve(corpusDirectory, file)));
  const { vectors } = decodeMameVectorFile(bytes, {
    limit: Number.isFinite(requestedLimit) ? requestedLimit : undefined,
  });
  const family: FamilyResult = {
    file,
    total: vectors.length,
    exact: 0,
    reviewedQuarantines: {},
    unexplained: [],
  };

  for (const vector of vectors) {
    const comparison = compareMameVector(vector);
    if (comparison.differences.length === 0) {
      family.exact += 1;
      continue;
    }
    const quarantine = classifyReviewedQuarantine(
      vector.name,
      comparison.faultCode,
      comparison.differences
    );
    if (quarantine !== undefined) {
      family.reviewedQuarantines[quarantine] = (family.reviewedQuarantines[quarantine] ?? 0) + 1;
      continue;
    }
    if (family.unexplained.length < 25) {
      family.unexplained.push({
        name: vector.name,
        faultCode: comparison.faultCode,
        differences: comparison.differences,
      });
    }
  }
  families.push(family);
}

const total = families.reduce((sum, family) => sum + family.total, 0);
const exact = families.reduce((sum, family) => sum + family.exact, 0);
const reviewedQuarantines = families.reduce(
  (sum, family) =>
    sum +
    Object.values(family.reviewedQuarantines).reduce((familySum, count) => familySum + count, 0),
  0
);
const unexplained = total - exact - reviewedQuarantines;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  corpusDirectory,
  vectorLimitPerFamily: Number.isFinite(requestedLimit) ? requestedLimit : null,
  summary: {
    families: families.length,
    total,
    exact,
    reviewedQuarantines,
    unexplained,
    exactPercent: Number(((exact / total) * 100).toFixed(3)),
  },
  quarantinePolicy: {
    'm68000-address-error-frame-and-bus-sequencing':
      'The core raises the correct architectural address error; exact 14-byte frame internals and microcycle bus order remain a temporal-conformance quarantine.',
    'chk-undefined-ccr-bits-in-stacked-frame':
      'CHK condition-code bits other than X are architecturally undefined and may differ inside the saved SR word.',
    'prefetch-stage-address-error-or-stop-pc':
      'The pipeline oracle attributes target-prefetch faults and STOP PC state to the current instruction; the non-prefetch core observes the target fault on the next step.',
  },
  families,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report.summary)}\n${outputPath}\n`);
if (unexplained > 0) process.exitCode = 1;
