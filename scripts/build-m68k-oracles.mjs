import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(import.meta.dirname, '..');
const musashiRoot = resolve(workspaceRoot, 'references/musashi');
const outputDirectory = resolve(workspaceRoot, '.tmp/oracles');
const outputPath = resolve(outputDirectory, 'musashi-runner');

function run(command, args, cwd = workspaceRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      [`${command} ${args.join(' ')} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
    );
  }
}

run('node', ['./scripts/bootstrap-m68k-oracles.mjs']);
run('make', ['-j2'], musashiRoot);
mkdirSync(outputDirectory, { recursive: true });
run('cc', [
  '-std=c99',
  '-O2',
  '-I',
  musashiRoot,
  resolve(workspaceRoot, 'tools/oracles/musashi_runner.c'),
  resolve(musashiRoot, 'm68kcpu.o'),
  resolve(musashiRoot, 'm68kops.o'),
  resolve(musashiRoot, 'm68kdasm.o'),
  resolve(musashiRoot, 'softfloat/softfloat.o'),
  '-lm',
  '-o',
  outputPath,
]);

process.stdout.write(`${outputPath}\n`);
