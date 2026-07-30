import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface OracleCpuState {
  d: number[];
  a: number[];
  pc: number;
  sr: number;
}

export interface OracleStepResult extends OracleCpuState {
  cycles: number;
  writes: Array<[address: number, size: number, value: number]>;
}

export function runMusashiStep(
  instructionBytes: Uint8Array,
  state: OracleCpuState
): OracleStepResult {
  return runOracleStep('musashi-runner', instructionBytes, state);
}

export function runMoiraStep(
  instructionBytes: Uint8Array,
  state: OracleCpuState
): OracleStepResult {
  return runOracleStep('moira-runner', instructionBytes, state);
}

function runOracleStep(
  executable: string,
  instructionBytes: Uint8Array,
  state: OracleCpuState
): OracleStepResult {
  const runner = resolve('.tmp/oracles', executable);
  const hex = Array.from(instructionBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const args = [
    hex,
    String(state.pc >>> 0),
    String(state.sr & 0xffff),
    ...state.d.map((value) => String(value >>> 0)),
    ...state.a.map((value) => String(value >>> 0)),
  ];
  const output = execFileSync(runner, args, {
    encoding: 'utf8',
  });
  return JSON.parse(output) as OracleStepResult;
}
