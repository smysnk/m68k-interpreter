import type { CpuModel } from '../isa/types';
import { decodeBinaryInstruction, type DecodedBinaryInstruction } from './decoder';

export type OpcodeClassification =
  | { status: 'legal'; instruction: DecodedBinaryInstruction }
  | { status: 'profile-illegal'; instruction: DecodedBinaryInstruction; requiredProfile: 'm68010' }
  | { status: 'illegal'; instruction: DecodedBinaryInstruction };

export function classifyOpcodeWord(opcode: number, cpuModel: CpuModel): OpcodeClassification {
  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 0xffff) {
    throw new RangeError(`Opcode must be an unsigned 16-bit integer: ${opcode}`);
  }
  const instruction = decodeBinaryInstruction(
    Uint8Array.of((opcode >>> 8) & 0xff, opcode & 0xff, 0, 0)
  );
  if (instruction.kind === 'unimplemented') return { status: 'illegal', instruction };
  if (
    instruction.kind === 'rtd' ||
    instruction.kind === 'move-from-ccr' ||
    instruction.kind === 'bkpt' ||
    instruction.kind === 'movec' ||
    instruction.kind === 'moves'
  ) {
    return cpuModel === 'm68010'
      ? { status: 'legal', instruction }
      : { status: 'profile-illegal', instruction, requiredProfile: 'm68010' };
  }
  return { status: 'legal', instruction };
}
