import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Emulator } from './emulator';
import { Strings } from './strings';

const nibblesPath = fileURLToPath(
  new URL('../../../../packages/ide/src/fixtures/nibbles.asm', import.meta.url)
);

function runProgram(emulator: Emulator, maxSteps = 1000): number {
  for (let step = 0; step < maxSteps; step += 1) {
    const shouldStop = emulator.emulationStep();
    if (shouldStop) {
      return step + 1;
    }
  }

  throw new Error(`Program did not halt within ${maxSteps} steps`);
}

function runUntil(
  emulator: Emulator,
  predicate: (emulator: Emulator) => boolean,
  maxSteps = 1000
): number {
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

function readSymbolByte(emulator: Emulator, symbol: string): number {
  const address = emulator.getSymbolAddress(symbol);
  if (typeof address !== 'number') {
    throw new Error(`Missing symbol: ${symbol}`);
  }

  return emulator.readMemoryRange(address, 1)[0] ?? 0;
}

function readSymbolLong(emulator: Emulator, symbol: string): number {
  const address = emulator.getSymbolAddress(symbol);
  if (typeof address !== 'number') {
    throw new Error(`Missing symbol: ${symbol}`);
  }

  const bytes = emulator.readMemoryRange(address, 4);
  return (
    (((bytes[0] ?? 0) << 24) >>> 0) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0)
  );
}

function readSymbolWord(emulator: Emulator, symbol: string): number {
  const address = emulator.getSymbolAddress(symbol);
  if (typeof address !== 'number') {
    throw new Error(`Missing symbol: ${symbol}`);
  }

  const bytes = emulator.readMemoryRange(address, 2);
  return ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
}

function writeSymbolLong(emulator: Emulator, symbol: string, value: number): void {
  const address = emulator.getSymbolAddress(symbol);
  if (typeof address !== 'number') {
    throw new Error(`Missing symbol: ${symbol}`);
  }

  emulator.writeMemoryByte(address, (value >>> 24) & 0xff);
  emulator.writeMemoryByte(address + 1, (value >>> 16) & 0xff);
  emulator.writeMemoryByte(address + 2, (value >>> 8) & 0xff);
  emulator.writeMemoryByte(address + 3, value & 0xff);
}

function expectCenteredLine(lines: string[], columns: number, marker: string): void {
  const row = lines.findIndex((line) => line.includes(marker));
  expect(row).toBeGreaterThanOrEqual(0);
  expect(lines[row]?.indexOf(marker)).toBe(Math.floor((columns - marker.length) / 2));
}

function expectBoxedButton(lines: string[], marker: string): {
  row: number;
  leftBorder: number;
  rightBorder: number;
} {
  const row = lines.findIndex((line) => line.includes(marker));
  expect(row).toBeGreaterThanOrEqual(0);
  const labelCol = lines[row]?.indexOf(marker) ?? -1;
  expect(labelCol).toBeGreaterThanOrEqual(0);
  const leftBorder = lines[row]?.lastIndexOf('│', labelCol) ?? -1;
  const rightBorder = lines[row]?.indexOf('│', labelCol + marker.length) ?? -1;
  expect(leftBorder).toBeGreaterThanOrEqual(0);
  expect(rightBorder).toBeGreaterThan(leftBorder);
  expect(lines[row - 1]?.slice(leftBorder, rightBorder + 1)).toBe(
    `┌${'─'.repeat(rightBorder - leftBorder - 1)}┐`
  );
  expect(lines[row + 1]?.slice(leftBorder, rightBorder + 1)).toBe(
    `└${'─'.repeat(rightBorder - leftBorder - 1)}┘`
  );
  return { row, leftBorder, rightBorder };
}

function writeSymbolByte(emulator: Emulator, symbol: string, value: number): void {
  const address = emulator.getSymbolAddress(symbol);
  if (typeof address !== 'number') {
    throw new Error(`Missing symbol: ${symbol}`);
  }

  emulator.writeMemoryByte(address, value);
}

function readArenaWord(emulator: Emulator, x: number, y: number): number {
  const boardAddress = emulator.getSymbolAddress('SNK_SCR');
  const columns = readSymbolByte(emulator, 'BOARD_COLS');
  if (typeof boardAddress !== 'number') {
    throw new Error('Missing symbol: SNK_SCR');
  }

  const offset = boardAddress + ((y * columns + x) * 2);
  const bytes = emulator.readMemoryRange(offset, 2);
  return ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
}

function findArenaWord(emulator: Emulator, value: number): { x: number; y: number } | null {
  const columns = readSymbolByte(emulator, 'BOARD_COLS');
  const rows = readSymbolByte(emulator, 'BOARD_ROWS');

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (readArenaWord(emulator, x, y) === value) {
        return { x, y };
      }
    }
  }

  return null;
}

function writeArenaWord(emulator: Emulator, x: number, y: number, value: number): void {
  const boardAddress = emulator.getSymbolAddress('SNK_SCR');
  const columns = readSymbolByte(emulator, 'BOARD_COLS');
  if (typeof boardAddress !== 'number') {
    throw new Error('Missing symbol: SNK_SCR');
  }

  const offset = boardAddress + ((y * columns + x) * 2);
  emulator.writeMemoryByte(offset, (value >> 8) & 0xff);
  emulator.writeMemoryByte(offset + 1, value & 0xff);
}

function seedNibblesHostLayout(
  emulator: Emulator,
  options: { columns: number; rows: number; layoutProfile: number }
): void {
  writeSymbolByte(emulator, 'TERM_COLS', options.columns);
  writeSymbolByte(emulator, 'TERM_ROWS', options.rows);
  writeSymbolByte(emulator, 'LAYOUT_PROFILE', options.layoutProfile);
}

function dispatchNibblesTouch(
  emulator: Emulator,
  options: { row: number; col: number; phase?: number; flags?: number }
): void {
  writeSymbolByte(emulator, 'TOUCH_PENDING', 1);
  writeSymbolByte(emulator, 'TOUCH_PHASE', options.phase ?? 1);
  writeSymbolByte(emulator, 'TOUCH_ROW', options.row);
  writeSymbolByte(emulator, 'TOUCH_COL', options.col);
  writeSymbolByte(emulator, 'TOUCH_FLAGS', options.flags ?? 0x12);

  const handlerAddress = emulator.getSymbolAddress('TOUCH_ISR');
  if (typeof handlerAddress !== 'number') {
    throw new Error('Missing symbol: TOUCH_ISR');
  }

  expect(emulator.raiseExternalInterrupt(handlerAddress)).toBe(true);
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

describe('Emulator - configurable undo capture', () => {
  const undoFixture = `
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  ADDQ.L #1,D0
  END START
`;

  it('keeps precise per-step undo in full mode', () => {
    const emulator = new Emulator(undoFixture);

    emulator.emulationStep();
    emulator.emulationStep();
    emulator.undoFromStack();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getRegisters()[8]).toBe(1);
  });

  it('disables snapshot capture in off mode', () => {
    const emulator = new Emulator(undoFixture, {
      undoMode: 'off',
    });

    emulator.emulationStep();
    emulator.emulationStep();
    emulator.undoFromStack();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getRegisters()[8]).toBe(2);
  });

  it('captures checkpointed undo frames and can switch back to full mode for manual stepping', () => {
    const emulator = new Emulator(undoFixture, {
      undoMode: 'checkpointed',
      undoCheckpointInterval: 2,
    });

    emulator.emulationStep();
    emulator.emulationStep();
    emulator.emulationStep();
    emulator.undoFromStack();

    expect(emulator.getRegisters()[8]).toBe(2);

    emulator.setUndoCaptureMode('full');
    emulator.emulationStep();
    emulator.undoFromStack();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getRegisters()[8]).toBe(2);
  });
});

describe('Emulator - runtime sync versions', () => {
  it('tracks register, execution, and diagnostics changes for IDE sync consumers', () => {
    const emulator = new Emulator(`
START
  MOVE.L #1,D0
  END START
`);

    const initialVersions = emulator.getRuntimeSyncVersions();

    emulator.emulationStep();

    const afterStepVersions = emulator.getRuntimeSyncVersions();
    expect(afterStepVersions.registers).toBeGreaterThan(initialVersions.registers);
    expect(afterStepVersions.execution).toBeGreaterThan(initialVersions.execution);
    expect(afterStepVersions.diagnostics).toBe(initialVersions.diagnostics);
    expect(afterStepVersions.memory).toBe(emulator.getMemoryMeta().version);
    expect(afterStepVersions.terminal).toBe(emulator.getTerminalMeta().version);

    const invalidInstruction = new Emulator(`
START
  NOPE
  END START
`);
    const invalidInitialVersions = invalidInstruction.getRuntimeSyncVersions();

    invalidInstruction.emulationStep();

    expect(invalidInstruction.getRuntimeSyncVersions().diagnostics).toBeGreaterThan(
      invalidInitialVersions.diagnostics
    );
  });
});

describe('Emulator - Phase 4 runtime support', () => {
  it('accepts initial terminal geometry and supports runtime terminal resizing', () => {
    const emulator = new Emulator(
      `START
  END START`,
      { columns: 64, rows: 20 }
    );

    expect(emulator.getTerminalMeta()).toMatchObject({
      columns: 64,
      rows: 20,
    });

    emulator.resizeTerminal(52, 18);

    expect(emulator.getTerminalMeta()).toMatchObject({
      columns: 52,
      rows: 18,
    });
  });

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
    expect(emulator.getUSP()).toBe(0x00100000);
    expect(emulator.getSSP()).toBe(0x00100000);
    expect(emulator.getSR()).toBe(emulator.getCCR() & 0x1f);
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
    runUntil(
      emulator,
      (instance) => instance.getTerminalMeta().output.length > 0,
      200
    );

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getTerminalMeta().output[0]).toBe('\u001b');
    expect(normalizeInstruction(emulator.getLastInstruction()).startsWith('TRAP #15')).toBe(true);
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
    const terminalMeta = emulator.getTerminalMeta();
    const terminalText = emulator.getTerminalText();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.isHalted()).toBe(true);
    expect(terminalMeta.output).toBe('A');
    expect(terminalText.startsWith('A')).toBe(true);
    expect(terminalMeta.cursorColumn).toBe(1);
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
    expect(
      queuedInputEmulator.getMemory()[queuedInputEmulator.getSymbolAddress('RESULT') ?? 0]
    ).toBe(1);
  });

  it('supports signed byte compare branches for BLT and BGT', () => {
    const code = `
RESULT DC.B 0
START
  MOVE.B #8,D0
  CMP.B #11,D0
  BLT LESS_THAN
  MOVE.B #1,RESULT
  BRA NEXT
LESS_THAN
  MOVE.B #2,RESULT
NEXT
  MOVE.B #12,D0
  CMP.B #11,D0
  BGT GREATER_THAN
  MOVE.B #3,RESULT
  BRA DONE
GREATER_THAN
  MOVE.B #4,RESULT
DONE
  TRAP #11
  DC.W 0
  END START
`;

    const emulator = new Emulator(code);
    runProgram(emulator, 100);

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.getMemory()[emulator.getSymbolAddress('RESULT') ?? 0]).toBe(4);
  });

  it('can wake a waiting program by raising a synthetic external interrupt', () => {
    const emulator = new Emulator(`
FLAG DC.B 0
START
  BSR WAIT_FOR_TOUCH
  TRAP #11
  DC.W 0
HANDLER
  MOVE.B #1,FLAG
  RTS
WAIT_FOR_TOUCH
  BSR _SGETCH
  RTS
_SGETCH
  TRAP #15
  DC.W 3
  RTS
  END START
`);

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 100);

    const handlerAddress = emulator.getSymbolAddress('HANDLER') ?? 0;
    const flagAddress = emulator.getSymbolAddress('FLAG') ?? 0;

    expect(emulator.raiseExternalInterrupt(handlerAddress)).toBe(true);
    expect(emulator.emulationStep()).toBe(false);
    runProgram(emulator, 50);

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(emulator.isWaitingForInput()).toBe(false);
    expect(emulator.getMemory()[flagAddress]).toBe(1);
  });

  it('renders the real Nibbles splash and menu text into the terminal', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 80, rows: 25 });

    seedNibblesHostLayout(emulator, {
      columns: 80,
      rows: 25,
      layoutProfile: 0,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 200000);
    const terminalMeta = emulator.getTerminalMeta();
    const renderedText = emulator.getTerminalText();
    const renderedLines = renderedText.split('\n');

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(terminalMeta.output.includes('\u001b[2J')).toBe(true);
    expect(renderedText.includes('DIFFICULTY')).toBe(true);
    expect(renderedText.includes('NEON SERPENT ARCADE')).toBe(true);
    expect(renderedText.includes('Joshua Bellamy')).toBe(true);
    expect(renderedText.includes('smysnk.com')).toBe(true);
    expect(renderedLines[0]).toBe(`┌${'─'.repeat(78)}┐`);
    expect(renderedLines[24]).toBe(`└${'─'.repeat(78)}┘`);
    expectCenteredLine(renderedLines, 80, 'NIBBLES');
    expectCenteredLine(renderedLines, 80, 'NEON SERPENT ARCADE');
    expectCenteredLine(renderedLines, 80, 'SELECT DIFFICULTY');
    expect(renderedLines.findIndex((line) => line.includes('EASY'))).toBeGreaterThan(
      renderedLines.findIndex((line) => line.includes('SELECT DIFFICULTY'))
    );
    expect(renderedLines.findIndex((line) => line.includes('MEDIUM'))).toBe(
      renderedLines.findIndex((line) => line.includes('EASY')) + 2
    );
  }, 15000);

  it('renders the portrait intro when the host seeds a portrait layout profile', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 38, rows: 48 });

    seedNibblesHostLayout(emulator, {
      columns: 38,
      rows: 48,
      layoutProfile: 2,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 200000);

    const renderedText = emulator.getTerminalText();

    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getErrors()).toEqual([]);
    expect(readSymbolByte(emulator, 'LAYOUT_PROFILE')).toBe(2);
    expect(renderedText).toContain('NEON SERPENT');
    expect(renderedText).toContain('DIFFICULTY');
    expect(renderedText).toContain('Tap difficulty');
    expect(renderedText).not.toContain('Touch the rows or use');
    const portraitLines = renderedText.split('\n');
    expectCenteredLine(portraitLines, 38, 'NIBBLES');
    expectCenteredLine(portraitLines, 38, 'SELECT DIFFICULTY');
    const easyButton = expectBoxedButton(portraitLines, 'EASY');
    const mediumButton = expectBoxedButton(portraitLines, 'MEDIUM');
    const hardButton = expectBoxedButton(portraitLines, 'HARD');
    const insaneButton = expectBoxedButton(portraitLines, 'INSANE');
    expect(mediumButton.leftBorder - easyButton.rightBorder).toBeGreaterThan(1);
    expect(hardButton.row - easyButton.row).toBeGreaterThan(1);
    expect(insaneButton.leftBorder - hardButton.rightBorder).toBeGreaterThan(1);
  }, 15000);

  it('renders a stylized desktop border with a bottom-row HUD', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 80, rows: 25 });

    seedNibblesHostLayout(emulator, {
      columns: 80,
      rows: 25,
      layoutProfile: 0,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 14,
      col: 8,
    });

    runUntil(
      emulator,
      (instance) => instance.getTerminalText().includes('LEVEL:') && instance.getTerminalText().includes('█'),
      500000
    );

    const renderedLines = emulator.getTerminalText().split('\n');

    expect(readSymbolByte(emulator, 'VIEWPORT_COLS')).toBe(80);
    expect(readSymbolByte(emulator, 'VIEWPORT_ROWS')).toBe(24);
    expect(readArenaWord(emulator, 0, 0)).toBe(0xfffe);
    expect(readArenaWord(emulator, 79, 23)).toBe(0xfffe);
    expect(renderedLines[0]).toBe(`┌${'─'.repeat(78)}┐`);
    expect(renderedLines[1]).toBe(`│${' '.repeat(78)}│`);
    expect(renderedLines[23]).toBe(`└${'─'.repeat(78)}┘`);
    expect(renderedLines[24]).toContain('SCORE:');
    expect(renderedLines[24]).toContain('LIVES:');
    expect(renderedLines[24]).toContain('LEVEL:');
  }, 20000);

  it('renders a compact portrait gameplay HUD and can steer by screen direction', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 30, rows: 20 });

    seedNibblesHostLayout(emulator, {
      columns: 30,
      rows: 20,
      layoutProfile: 2,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 20,
    });

    runUntil(
      emulator,
      (instance) => {
        const renderedText = instance.getTerminalText();
        return renderedText.includes('Lv:1') && renderedText.includes('█');
      },
      500000
    );

    const renderedLines = emulator.getTerminalText().split('\n');

    expect(emulator.isWaitingForInput()).toBe(false);
    expect(emulator.getTerminalText()).toContain('S:0  L:5  Lv:1');
    expect(emulator.getTerminalText()).not.toContain('Touch to steer');
    expect(emulator.getTerminalText()).not.toContain('SCORE:');
    expect(readSymbolByte(emulator, 'VIEWPORT_COLS')).toBe(30);
    expect(readSymbolByte(emulator, 'VIEWPORT_ROWS')).toBe(19);
    expect(readArenaWord(emulator, 0, 0)).toBe(0xfffe);
    expect(readArenaWord(emulator, 29, 18)).toBe(0xfffe);
    expect(readSymbolByte(emulator, 'POS_X')).toBe(15);
    expect(readSymbolByte(emulator, 'POS_Y')).toBe(9);
    expect(renderedLines[0]).toBe(`┌${'─'.repeat(28)}┐`);
    expect(renderedLines[1]).toBe(`│${' '.repeat(28)}│`);
    expect(renderedLines.some((line) => line.includes('█'))).toBe(true);
    expect(renderedLines[18]).toBe(`└${'─'.repeat(28)}┘`);
    expect(renderedLines[19]).toContain('S:0  L:5  Lv:1');

    dispatchNibblesTouch(emulator, {
      row: 11,
      col: 24,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 1, 5000);
    expect(readSymbolByte(emulator, 'MOVING')).toBe(1);
    expect(readSymbolByte(emulator, 'DIRECTION')).toBe(1);

    dispatchNibblesTouch(emulator, {
      row: 4,
      col: 15,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 2, 5000);
    expect(readSymbolByte(emulator, 'DIRECTION')).toBe(2);

    writeSymbolByte(emulator, 'LAST_DIR', 1);
    writeSymbolByte(emulator, 'DIRECTION', 1);
    dispatchNibblesTouch(emulator, {
      row: 4,
      col: 3,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 2, 5000);
    expect(readSymbolByte(emulator, 'DIRECTION')).toBe(2);

    writeSymbolByte(emulator, 'LAST_DIR', 1);
    writeSymbolByte(emulator, 'DIRECTION', 1);
    dispatchNibblesTouch(emulator, {
      row: 11,
      col: 7,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 3, 5000);
    expect(readSymbolByte(emulator, 'DIRECTION')).toBe(3);
  }, 20000);

  it('advances through several consecutive gameplay moves within a browser-sized step budget', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 30, rows: 20 });

    seedNibblesHostLayout(emulator, {
      columns: 30,
      rows: 20,
      layoutProfile: 2,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 20,
    });

    runUntil(
      emulator,
      (instance) => instance.getTerminalText().includes('Lv:1') && instance.getTerminalText().includes('█'),
      500000
    );

    expect(readSymbolLong(emulator, 'SNK_SPEED')).toBe(0x2c00);

    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 28,
      phase: 2,
    });

    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 1, 5000);

    const positions = [readSymbolByte(emulator, 'POS_X')];

    while (positions.length < 4) {
      const currentX = positions.at(-1) ?? 0;
      runUntil(emulator, () => readSymbolByte(emulator, 'POS_X') !== currentX, 250000);
      positions.push(readSymbolByte(emulator, 'POS_X'));
    }

    expect(positions).toEqual([15, 16, 17, 18]);
    expect(readSymbolByte(emulator, 'LAST_DIR')).toBe(1);
    expect(readSymbolByte(emulator, 'MOVING')).toBe(1);
  }, 20000);

  it('allows steering while growing and only grows by one segment per food', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 30, rows: 20 });

    seedNibblesHostLayout(emulator, {
      columns: 30,
      rows: 20,
      layoutProfile: 2,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 20,
    });

    runUntil(
      emulator,
      (instance) => instance.getTerminalText().includes('Lv:1') && instance.getTerminalText().includes('█'),
      500000
    );

    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 28,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 1, 5000);

    const startX = readSymbolByte(emulator, 'POS_X');
    const startY = readSymbolByte(emulator, 'POS_Y');
    const startLife = readSymbolWord(emulator, 'SNK_LIFE');

    writeArenaWord(emulator, startX + 1, startY, 0xffff);
    writeSymbolByte(emulator, 'FOOD_AVAIL', 1);

    runUntil(emulator, () => readSymbolWord(emulator, 'SNK_LIFE') === startLife + 1, 250000);

    expect(readSymbolByte(emulator, 'POS_X')).toBe(startX + 1);
    expect(readSymbolByte(emulator, 'SCORE')).toBe(1);
    expect(readSymbolByte(emulator, 'FOOD_NUM')).toBe(1);
    expect(readSymbolByte(emulator, 'DELAY_DECAY')).toBe(1);
    expect(readSymbolWord(emulator, 'SNK_LIFE')).toBe(startLife + 1);

    dispatchNibblesTouch(emulator, {
      row: 2,
      col: 15,
      phase: 2,
    });
    runUntil(emulator, () => readSymbolByte(emulator, 'DIRECTION') === 2, 5000);
    runUntil(emulator, () => readSymbolByte(emulator, 'POS_Y') === startY - 1, 250000);

    expect(readSymbolByte(emulator, 'LAST_DIR')).toBe(2);
    expect(readSymbolByte(emulator, 'MOVING')).toBe(1);
  }, 20000);

  it('spawns and renders the next food immediately after losing a life', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 30, rows: 20 });

    seedNibblesHostLayout(emulator, {
      columns: 30,
      rows: 20,
      layoutProfile: 2,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 10,
      col: 20,
    });

    runUntil(
      emulator,
      (instance) => instance.getTerminalText().includes('Lv:1') && instance.getTerminalText().includes('█'),
      500000
    );

    const boardCols = readSymbolByte(emulator, 'BOARD_COLS');
    writeSymbolByte(emulator, 'POS_X', boardCols - 1);
    writeSymbolByte(emulator, 'DIRECTION', 1);
    writeSymbolByte(emulator, 'LAST_DIR', 1);
    writeSymbolByte(emulator, 'MOVING', 1);
    writeSymbolLong(emulator, 'TIMER', readSymbolLong(emulator, 'SNK_SPEED') - 1);

    runUntil(
      emulator,
      (instance) =>
        readSymbolByte(instance, 'LIVES') === 4 &&
        readSymbolByte(instance, 'POS_X') === Math.floor(readSymbolByte(instance, 'BOARD_COLS') / 2) &&
        readSymbolByte(instance, 'POS_Y') === Math.floor(readSymbolByte(instance, 'BOARD_ROWS') / 2) &&
        readSymbolByte(instance, 'FOOD_AVAIL') === 1,
      500000
    );

    expect(readSymbolByte(emulator, 'FOOD_AVAIL')).toBe(1);
    const foodPosition = findArenaWord(emulator, 0xffff);
    expect(foodPosition).not.toBeNull();

    const renderedLines = emulator.getTerminalText().split('\n');
    const foodDigit = String.fromCharCode(0x30 + readSymbolByte(emulator, 'FOOD_NUM'));
    expect(renderedLines[foodPosition!.y]?.[foodPosition!.x]).toBe(foodDigit);
  }, 20000);

  it('treats shallow wide terminals as mobile landscape and keeps a one-line HUD', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const emulator = new Emulator(sourceBytes, { columns: 52, rows: 14 });

    seedNibblesHostLayout(emulator, {
      columns: 52,
      rows: 14,
      layoutProfile: 1,
    });

    runUntil(emulator, (instance) => instance.isWaitingForInput(), 40000);
    dispatchNibblesTouch(emulator, {
      row: 7,
      col: 30,
    });

    runUntil(
      emulator,
      (instance) => instance.getTerminalText().includes('Lv:1'),
      500000
    );

    const renderedText = emulator.getTerminalText();

    expect(readSymbolByte(emulator, 'LAYOUT_PROFILE')).toBe(1);
    expect(readSymbolByte(emulator, 'VIEWPORT_COLS')).toBe(52);
    expect(readSymbolByte(emulator, 'VIEWPORT_ROWS')).toBe(13);
    expect(readArenaWord(emulator, 0, 0)).toBe(0xfffe);
    expect(readArenaWord(emulator, 51, 12)).toBe(0xfffe);
    expect(renderedText).toContain('S:0  L:5  Lv:1');
    expect(renderedText).not.toContain('Touch to steer');
  }, 20000);
});
