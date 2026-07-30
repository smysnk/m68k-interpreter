import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(import.meta.dirname, '..');
const musashiRoot = resolve(workspaceRoot, 'references/musashi');
const moiraRoot = resolve(workspaceRoot, 'references/moira');
const outputDirectory = resolve(workspaceRoot, '.tmp/oracles');
const musashiOutputPath = resolve(outputDirectory, 'musashi-runner');
const moiraOutputPath = resolve(outputDirectory, 'moira-runner');

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

function needsBuild(outputPath, sourcePaths) {
  if (!existsSync(outputPath)) {
    return true;
  }
  const outputTime = statSync(outputPath).mtimeMs;
  return sourcePaths.some((sourcePath) => statSync(sourcePath).mtimeMs > outputTime);
}

run('node', ['./scripts/bootstrap-m68k-oracles.mjs']);
run('make', ['-j2'], musashiRoot);
mkdirSync(outputDirectory, { recursive: true });
const musashiRunnerSource = resolve(workspaceRoot, 'tools/oracles/musashi_runner.c');
const musashiObjects = [
  resolve(musashiRoot, 'm68kcpu.o'),
  resolve(musashiRoot, 'm68kops.o'),
  resolve(musashiRoot, 'm68kdasm.o'),
  resolve(musashiRoot, 'softfloat/softfloat.o'),
];
if (needsBuild(musashiOutputPath, [musashiRunnerSource, ...musashiObjects])) {
  run('cc', [
    '-std=c99',
    '-O2',
    '-I',
    musashiRoot,
    musashiRunnerSource,
    ...musashiObjects,
    '-lm',
    '-o',
    musashiOutputPath,
  ]);
}

const moiraSources = [
  resolve(workspaceRoot, 'tools/oracles/moira_runner.cpp'),
  resolve(moiraRoot, 'Moira/Moira.cpp'),
  resolve(moiraRoot, 'Moira/MoiraDebugger.cpp'),
];
if (needsBuild(moiraOutputPath, moiraSources)) {
  run('c++', [
    '-std=c++20',
    '-O2',
    '-Wno-unused-parameter',
    '-Wno-unused-variable',
    '-I',
    resolve(moiraRoot, 'Moira'),
    ...moiraSources,
    '-o',
    moiraOutputPath,
  ]);
}

process.stdout.write(`${musashiOutputPath}\n${moiraOutputPath}\n`);
