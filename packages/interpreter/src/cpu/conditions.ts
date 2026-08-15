import type { BranchCondition } from '../assembler/encoder';

const FLAG_C = 0x01;
const FLAG_V = 0x02;
const FLAG_Z = 0x04;
const FLAG_N = 0x08;

export function evaluateBranchCondition(condition: BranchCondition, sr: number): boolean {
  const c = (sr & FLAG_C) !== 0;
  const v = (sr & FLAG_V) !== 0;
  const z = (sr & FLAG_Z) !== 0;
  const n = (sr & FLAG_N) !== 0;

  switch (condition) {
    case 'bra':
    case 'bsr':
      return true;
    case 'hi':
      return !c && !z;
    case 'ls':
      return c || z;
    case 'cc':
      return !c;
    case 'cs':
      return c;
    case 'ne':
      return !z;
    case 'eq':
      return z;
    case 'vc':
      return !v;
    case 'vs':
      return v;
    case 'pl':
      return !n;
    case 'mi':
      return n;
    case 'ge':
      return n === v;
    case 'lt':
      return n !== v;
    case 'gt':
      return !z && n === v;
    case 'le':
      return z || n !== v;
  }
}

export function evaluateConditionCode(condition: number, sr: number): boolean {
  if (!Number.isInteger(condition) || condition < 0 || condition > 15) {
    throw new RangeError(`Condition code must be an integer from 0 through 15: ${condition}`);
  }
  if (condition === 0) return true;
  if (condition === 1) return false;
  const branchConditions: readonly BranchCondition[] = [
    'bra',
    'bsr',
    'hi',
    'ls',
    'cc',
    'cs',
    'ne',
    'eq',
    'vc',
    'vs',
    'pl',
    'mi',
    'ge',
    'lt',
    'gt',
    'le',
  ];
  return evaluateBranchCondition(branchConditions[condition], sr);
}
