import { describe, expect, it } from 'vitest';
import { createEmptyTerminalState } from './state';
import {
  resetTerminalState,
  resizeTerminalState,
  writeTerminalBytes,
} from './terminalReducer';

describe('terminalReducer', () => {
  it('applies cursor movement, clear-screen, and SGR state while preserving the raw output stream', () => {
    const initialState = createEmptyTerminalState(10, 4);
    const bytes = '\u001b[2J\u001b[2;3HHi\u001b[33;40m!\u001b[0m'
      .split('')
      .map((char) => char.charCodeAt(0));

    const terminal = writeTerminalBytes(initialState, bytes);
    const exclamationCell = terminal.cells[1][4];
    const lines = terminal.cells.map((row) => row.map((cell) => cell.char).join(''));

    expect(terminal.output).toBe('\u001b[2J\u001b[2;3HHi\u001b[33;40m!\u001b[0m');
    expect(lines[1].slice(2, 5)).toBe('Hi!');
    expect(exclamationCell.char).toBe('!');
    expect(exclamationCell.foreground).toBe(33);
    expect(exclamationCell.background).toBe(40);
    expect(terminal.cursorRow).toBe(1);
    expect(terminal.cursorColumn).toBe(5);
  });

  it('handles carriage return, line feed, backspace, and null bytes', () => {
    const initialState = createEmptyTerminalState(4, 2);
    const bytes = 'AB\rC\nD\bE\0'.split('').map((char) => char.charCodeAt(0));

    const terminal = writeTerminalBytes(initialState, bytes);
    const lines = terminal.cells.map((row) => row.map((cell) => cell.char).join(''));

    expect(lines[0]).toBe('CB  ');
    expect(lines[1]).toBe(' E  ');
    expect(terminal.cursorRow).toBe(1);
    expect(terminal.cursorColumn).toBe(2);
    expect(terminal.output).toBe('AB\rC\nD\bE\0');
  });

  it('resets and resizes as pure terminal state operations', () => {
    const writtenState = writeTerminalBytes(
      createEmptyTerminalState(4, 2),
      'TEST'.split('').map((char) => char.charCodeAt(0))
    );

    const resetState = resetTerminalState(writtenState);
    const resizedState = resizeTerminalState(resetState, 6, 3);

    expect(resetState.output).toBe('');
    expect(resetState.cursorRow).toBe(0);
    expect(resetState.cursorColumn).toBe(0);
    expect(resetState.cells).toHaveLength(2);
    expect(resetState.cells[0]).toHaveLength(4);

    expect(resizedState.output).toBe('');
    expect(resizedState.cells).toHaveLength(3);
    expect(resizedState.cells[0]).toHaveLength(6);
  });
});
