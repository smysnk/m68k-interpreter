import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface OracleCpuState {
  d: number[];
  a: number[];
  pc: number;
  sr: number;
  vbr?: number;
  sfc?: number;
  dfc?: number;
}

export interface OracleStepResult extends OracleCpuState {
  cycles: number;
  writes: Array<[address: number, size: number, value: number]>;
}

export type OracleCpuModel = 'm68000' | 'm68010' | 'm68020';

export function runMusashiStep(
  instructionBytes: Uint8Array,
  state: OracleCpuState,
  cpuModel: OracleCpuModel = 'm68000'
): OracleStepResult {
  return runOracleStep('musashi-runner', instructionBytes, state, cpuModel);
}

export function runMoiraStep(
  instructionBytes: Uint8Array,
  state: OracleCpuState,
  cpuModel: OracleCpuModel = 'm68000'
): OracleStepResult {
  return runOracleStep('moira-runner', instructionBytes, state, cpuModel);
}

function runOracleStep(
  executable: string,
  instructionBytes: Uint8Array,
  state: OracleCpuState,
  cpuModel: OracleCpuModel
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
    env: {
      ...process.env,
      M68K_CPU_MODEL: cpuModel,
      M68K_VBR: String(state.vbr ?? 0),
      M68K_SFC: String(state.sfc ?? 0),
      M68K_DFC: String(state.dfc ?? 0),
    },
  });
  return JSON.parse(output) as OracleStepResult;
}
