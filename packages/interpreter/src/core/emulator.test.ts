import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Emulator } from './emulator';
import { Strings } from './strings';

const nibblesPath = fileURLToPath(new URL('../../../../../../nibbles.asm', import.meta.url));

function runProgram(emulator: Emulator, maxSteps = 1000): number {
  for (let step = 0; step < maxSteps; step += 1) {
    const shouldStop = emulator.emulationStep();
    if (shouldStop) {
      return step + 1;
    }
  }

  throw new Error(`Program did not halt within ${maxSteps} steps`);
}

function runUntil(emulator: Emulator, predicate: (emulator: Emulator) => boolean, maxSteps = 1000): number {
  for (let step = 0; step < maxSteps; step += 1) {
    emulator.emulationStep();
    if (predicate(emulator)) {
      return step + 1;
    }
  }

  throw new Error(
    `Condition not reached within ${maxSteps} steps. Last instruction: ${normalizeInstruction(
      emulator.getLastInstruction()
    )}. Exception: ${emulator.getException() ?? 'none'}. Errors: ${emulator
      .getErrors()
      .slice(-3)
      .join(' | ')}. Waiting: ${emulator.isWaitingForInput()}. Halted: ${emulator.isHalted()}.`
  );
}

function normalizeInstruction(instruction: string): string {
  return instruction.replace(/\s+/g, ' ').trim();
}

describe('Emulator - END directive handling', () => {
  it('should set exception when END directive is missing', () => {
    const code = `
      ORG $1000
      MOVE #10, D0
    `;
    const emulator = new Emulator(code);
    expect(emulator.getException()).toBe(Strings.END_MISSING);
  });

  it('should not set exception when END directive is present', () => {
    const code = `
      ORG $1000
      MOVE #10, D0
      END
    `;
    const emulator = new Emulator(code);
    expect(emulator.getException()).toBeUndefined();
  });

  it('should reset exception after running program without END', () => {
    // First, run a program without END directive
    const badCode = `
      ORG $1000
      MOVE #10, D0
    `;
    const badEmulator = new Emulator(badCode);
    expect(badEmulator.getException()).toBe(Strings.END_MISSING);

    // Then, run a program with valid END directive
    const goodCode = `
      ORG $1000
      MOVE #10, D0
      END
    `;
    const goodEmulator = new Emulator(goodCode);
    expect(goodEmulator.getException()).toBeUndefined();
  });

  it('loads nibbles.asm without parser exceptions and exposes stable symbol addresses', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes);
    const splashAddress = emulator.getSymbolAddress('STR_SPLASH_SCR');
    const timerAddress = emulator.getSymbolAddress('TIMER');
    const boardAddress = emulator.getSymbolAddress('SNK_SCR');
    const memory = emulator.getMemory();

    expect(emulator.getException()).toBeUndefined();
    expect(splashAddress).toBeDefined();
    expect(timerAddress).toBeDefined();
    expect(boardAddress).toBeDefined();
    expect(boardAddress).toBe((timerAddress ?? 0) + 4);
    expect(memory[splashAddress ?? 0]).toBe(0x1b);
    expect(memory[(splashAddress ?? 0) + 1]).toBe(0x5b);
    expect(memory[(splashAddress ?? 0) + 2]).toBe(0x32);
    expect(emulator.getSymbolAddress('str_splash_scr')).toBe(splashAddress);
  });
});

describe('Emulator - Phase 4 runtime support', () => {
  it('preserves registers across BSR/RTS and MOVEM.L stack frames', () => {
    const code = `
START
  MOVE.L #$11223344,D0
  MOVE.L #$55667788,D1
  BSR SAVE
  MOVE.L D0,RESULT0
  MOVE.L D1,RESULT1
  BRA EXIT
SAVE
  MOVEM.L D0-D1/A0,-(SP)
  MOVE.L #0,D0
  MOVE.L #0,D1
  MOVEM.L (SP)+,D0-D1/A0
  RTS
RESULT0 DC.L 0
RESULT1 DC.L 0
EXIT
  MOVE.L D0,D0
  END START
`;

    const emulator = new Emulator(code);
    runProgram(emulator);

    const result0Address = emulator.getSymbolAddress('RESULT0') ?? 0;
    const result1Address = emulator.getSymbolAddress('RESULT1') ?? 0;
    const memory = emulator.getMemory();
    const registers = emulator.getRegisters();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(memory[result0Address]).toBe(0x11);
    expect(memory[result0Address + 1]).toBe(0x22);
    expect(memory[result0Address + 2]).toBe(0x33);
    expect(memory[result0Address + 3]).toBe(0x44);
    expect(memory[result1Address]).toBe(0x55);
    expect(memory[result1Address + 1]).toBe(0x66);
    expect(memory[result1Address + 2]).toBe(0x77);
    expect(memory[result1Address + 3]).toBe(0x88);
    expect(registers[7]).toBe(0x00100000);
  });

  it('supports indexed memory operands plus MULU and DIVU board math', () => {
    const code = `
TABLE DS.W 4
RESULT_VALUE DC.L 0
RESULT_DIV DC.L 0
START
  MOVE.L #TABLE,A0
  MOVE.W #$0011,$00(A0)
  MOVE.W #$0022,$02(A0)
  MOVE.W #$0033,$04(A0)
  MOVE.W #$0044,$06(A0)
  MOVE.W #2,D0
  MULU #2,D0
  MOVE.W $00(A0,D0.W),D1
  MOVE.W D1,RESULT_VALUE
  MOVE.W #17,D2
  DIVU #5,D2
  MOVE.L D2,RESULT_DIV
  END START
`;

    const emulator = new Emulator(code);
    runProgram(emulator);

    const resultValueAddress = emulator.getSymbolAddress('RESULT_VALUE') ?? 0;
    const resultDivAddress = emulator.getSymbolAddress('RESULT_DIV') ?? 0;
    const memory = emulator.getMemory();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect((memory[resultValueAddress] << 8) | memory[resultValueAddress + 1]).toBe(0x0033);
    expect(memory[resultDivAddress]).toBe(0x00);
    expect(memory[resultDivAddress + 1]).toBe(0x02);
    expect(memory[resultDivAddress + 2]).toBe(0x00);
    expect(memory[resultDivAddress + 3]).toBe(0x03);
  });

  it('handles direct-memory ADD/SUB/CMP flows and BTST-driven branches', () => {
    const code = `
COUNTER DC.B 0
START
  MOVE.B #2,D0
  ADD.B #1,COUNTER
  ADD.B #1,COUNTER
  SUBI.B #1,COUNTER
  CMP.B #1,COUNTER
  BNE FAIL
  BTST #1,D0
  BEQ FAIL
  BTST #0,D0
  BNE FAIL
  MOVE.L #$12345678,D7
  BRA DONE
FAIL
  MOVE.L #$DEADBEEF,D7
DONE
  MOVE.L D7,D7
  END START
`;

    const emulator = new Emulator(code);
    runProgram(emulator);

    const counterAddress = emulator.getSymbolAddress('COUNTER') ?? 0;
    const memory = emulator.getMemory();
    const registers = emulator.getRegisters();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(memory[counterAddress]).toBe(1);
    expect(registers[15] >>> 0).toBe(0x12345678);
  });

  it('executes the real Nibbles startup display path up to the first terminal trap', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes);
    const splashAddress = emulator.getSymbolAddress('STR_SPLASH_SCR') ?? 0;

    for (let step = 0; step < 40; step += 1) {
      expect(emulator.emulationStep()).toBe(false);
      expect(emulator.getException()).toBeUndefined();
      expect(emulator.getErrors()).toEqual([]);

      if (normalizeInstruction(emulator.getLastInstruction()).startsWith('BSR _SPUTCH')) {
        break;
      }
    }

    const registers = emulator.getRegisters();

    expect(normalizeInstruction(emulator.getLastInstruction()).startsWith('BSR _SPUTCH')).toBe(
      true
    );
    expect(registers[1]).toBe(splashAddress + 1);
    expect(registers[8] & 0xff).toBe(0x1b);
  });
});

describe('Emulator - Phase 5 terminal and traps', () => {
  it('writes characters through TRAP #15 task 1 and halts through TRAP #11 task 0', () => {
    const code = `
START
  MOVE.B #'A',D0
  BSR _SPUTCH
  TRAP #11
  DC.W 0
_SPUTCH
  TRAP #15
  DC.W 1
  RTS
  END START
`;

    const emulator = new Emulator(code);
    runProgram(emulator);
    const terminal = emulator.getTerminalSnapshot();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.isHalted()).toBe(true);
    expect(terminal.output).toBe('A');
    expect(terminal.lines[0].startsWith('A')).toBe(true);
    expect(terminal.cursorColumn).toBe(1);
  });

  it('blocks on TRAP #15 task 3 until queued input is available', () => {
    const code = `
RESULT DC.B 0
START
  BSR _SGETCH
  MOVE.B D0,RESULT
  TRAP #11
  DC.W 0
_SGETCH
  TRAP #15
  DC.W 3
  RTS
  END START
`;

    const emulator = new Emulator(code);
    runUntil(emulator, (instance) => instance.isWaitingForInput(), 100);
    expect(emulator.isWaitingForInput()).toBe(true);
    expect(emulator.getQueuedInputLength()).toBe(0);

    emulator.queueInput('w');
    emulator.emulationStep();
    expect(emulator.isWaitingForInput()).toBe(false);
    runProgram(emulator);

    const resultAddress = emulator.getSymbolAddress('RESULT') ?? 0;
    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getMemory()[resultAddress]).toBe('w'.charCodeAt(0));
    expect(emulator.getQueuedInputLength()).toBe(0);
  });

  it('updates the zero flag for TRAP #15 task 4 keyboard polling', () => {
    const code = `
RESULT DC.B 0
START
  TRAP #15
  DC.W 4
  BEQ NO_INPUT
  MOVE.B #1,RESULT
  BRA EXIT
NO_INPUT
  MOVE.B #2,RESULT
EXIT
  TRAP #11
  DC.W 0
  END START
`;

    const noInputEmulator = new Emulator(code);
    runProgram(noInputEmulator);
    expect(noInputEmulator.getException()).toBeUndefined();
    expect(noInputEmulator.getMemory()[noInputEmulator.getSymbolAddress('RESULT') ?? 0]).toBe(2);

    const queuedInputEmulator = new Emulator(code);
    queuedInputEmulator.queueInput('a');
    runProgram(queuedInputEmulator);
    expect(queuedInputEmulator.getException()).toBeUndefined();
    expect(queuedInputEmulator.getMemory()[queuedInputEmulator.getSymbolAddress('RESULT') ?? 0]).toBe(1);
  });

  it(
    'renders the real Nibbles splash and menu text into the terminal',
    () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes);

    runUntil(
      emulator,
      (instance) => {
        const renderedText = instance.getTerminalSnapshot().lines.join('\n');
        return (
          renderedText.includes('Difficulty') && renderedText.includes('Programmed By Josh Henn')
        );
      },
      40000
    );
    const terminal = emulator.getTerminalSnapshot();
    const renderedText = terminal.lines.join('\n');

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(terminal.output.includes('\u001b[2J')).toBe(true);
    expect(renderedText.includes('Difficulty')).toBe(true);
    expect(renderedText.includes('Programmed By Josh Henn')).toBe(true);
    },
    15000
  );
});
