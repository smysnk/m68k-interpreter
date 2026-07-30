import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(import.meta.dirname, '..');
const lockPath = resolve(workspaceRoot, 'tools/oracles/oracles.lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

function runGit(args, cwd = workspaceRoot) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      [`git ${args.join(' ')} failed in ${cwd}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
    );
  }

  return result.stdout.trim();
}

for (const oracle of lock.oracles) {
  const checkoutPath = resolve(workspaceRoot, oracle.checkoutPath);

  try {
    runGit(['rev-parse', '--git-dir'], checkoutPath);
  } catch {
    runGit(['clone', '--filter=blob:none', oracle.repository, checkoutPath]);
  }

  const hasCommit = spawnSync('git', ['cat-file', '-e', `${oracle.commit}^{commit}`], {
    cwd: checkoutPath,
    stdio: 'ignore',
  });
  if (hasCommit.status !== 0) {
    runGit(['fetch', '--depth=1', 'origin', oracle.commit], checkoutPath);
  }

  runGit(['checkout', '--detach', oracle.commit], checkoutPath);
  const actualCommit = runGit(['rev-parse', 'HEAD'], checkoutPath);
  if (actualCommit !== oracle.commit) {
    throw new Error(`${oracle.id} resolved to ${actualCommit}, expected ${oracle.commit}`);
  }

  process.stdout.write(`${oracle.id}: ${actualCommit}\n`);
}
