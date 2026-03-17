import { describe, expect, it } from 'vitest';
import { TerminalDevice } from './terminal';

describe('TerminalDevice', () => {
  it('applies cursor movement, clear-screen, and SGR state while preserving the raw output stream', () => {
    const terminal = new TerminalDevice({ columns: 10, rows: 4 });
    const bytes = '\u001b[2J\u001b[2;3HHi\u001b[33;40m!\u001b[0m'.split('').map((char) => char.charCodeAt(0));

    for (const byte of bytes) {
      terminal.writeByte(byte);
    }

    const snapshot = terminal.getSnapshot();
    const exclamationCell = snapshot.cells[1][4];

    expect(snapshot.output).toBe('\u001b[2J\u001b[2;3HHi\u001b[33;40m!\u001b[0m');
    expect(snapshot.lines[1].slice(2, 5)).toBe('Hi!');
    expect(exclamationCell.char).toBe('!');
    expect(exclamationCell.foreground).toBe(33);
    expect(exclamationCell.background).toBe(40);
    expect(snapshot.cursorRow).toBe(1);
    expect(snapshot.cursorColumn).toBe(5);
  });
});
