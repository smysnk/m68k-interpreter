import { describe, expect, it } from 'vitest';
import { TerminalDevice } from './terminal';

describe('TerminalDevice', () => {
  it('applies cursor movement, clear-screen, and SGR state while preserving the raw output stream', () => {
    const terminal = new TerminalDevice({ columns: 10, rows: 4 });
    const bytes = '\u001b[2J\u001b[2;3HHi\u001b[33;40m!\u001b[0m'
      .split('')
      .map((char) => char.charCodeAt(0));

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

  it('writes into a reusable frame buffer while preserving compatibility snapshots', () => {
    const terminal = new TerminalDevice({ columns: 5, rows: 2 });
    const frameBuffer = terminal.getFrameBuffer();
    const backingStore = frameBuffer.data;

    'ABCD'.split('').forEach((char) => {
      terminal.writeByte(char.charCodeAt(0));
    });
    terminal.reset();
    terminal.writeByte('Z'.charCodeAt(0));

    expect(terminal.getFrameBuffer()).toBe(frameBuffer);
    expect(terminal.getFrameBuffer().data).toBe(backingStore);
    expect(terminal.getTerminalMeta().cursorColumn).toBe(1);
    expect(terminal.getLines()[0].startsWith('Z')).toBe(true);
    expect(terminal.getText().startsWith('Z')).toBe(true);
    expect(terminal.getSnapshot().lines[0].startsWith('Z')).toBe(true);
  });

  it('scrolls by shifting the existing frame buffer instead of rebuilding row objects', () => {
    const terminal = new TerminalDevice({ columns: 4, rows: 2 });
    const frameBuffer = terminal.getFrameBuffer();
    const backingStore = frameBuffer.data;

    'ABCD'.split('').forEach((char) => terminal.writeByte(char.charCodeAt(0)));
    'EFGH'.split('').forEach((char) => terminal.writeByte(char.charCodeAt(0)));
    terminal.writeByte('I'.charCodeAt(0));

    expect(terminal.getFrameBuffer()).toBe(frameBuffer);
    expect(terminal.getFrameBuffer().data).toBe(backingStore);
    expect(terminal.getLines()).toEqual(['EFGH', 'I   ']);
  });

  it('waits to wrap until another printable character arrives after filling the last column', () => {
    const terminal = new TerminalDevice({ columns: 4, rows: 2 });

    'ABCD'.split('').forEach((char) => terminal.writeByte(char.charCodeAt(0)));

    expect(terminal.getLines()).toEqual(['ABCD', '    ']);
    expect(terminal.getTerminalMeta()).toMatchObject({
      cursorRow: 0,
      cursorColumn: 3,
    });

    terminal.writeByte('E'.charCodeAt(0));

    expect(terminal.getLines()).toEqual(['ABCD', 'E   ']);
    expect(terminal.getTerminalMeta()).toMatchObject({
      cursorRow: 1,
      cursorColumn: 1,
    });
  });

  it('does not scroll a full bottom row until another printable character is written', () => {
    const terminal = new TerminalDevice({ columns: 4, rows: 2 });

    '\u001b[2;1H'
      .split('')
      .forEach((char) => terminal.writeByte(char.charCodeAt(0)));
    'WXYZ'.split('').forEach((char) => terminal.writeByte(char.charCodeAt(0)));

    expect(terminal.getLines()).toEqual(['    ', 'WXYZ']);
    expect(terminal.getTerminalMeta()).toMatchObject({
      cursorRow: 1,
      cursorColumn: 3,
    });

    terminal.writeByte('!'.charCodeAt(0));

    expect(terminal.getLines()).toEqual(['WXYZ', '!   ']);
    expect(terminal.getTerminalMeta()).toMatchObject({
      cursorRow: 1,
      cursorColumn: 1,
    });
  });

  it('resizes an empty terminal buffer and exposes the new geometry through snapshots', () => {
    const terminal = new TerminalDevice({ columns: 4, rows: 2 });

    terminal.resize(6, 3);

    expect(terminal.getTerminalMeta()).toMatchObject({
      columns: 6,
      rows: 3,
    });
    expect(terminal.getFrameBuffer()).toMatchObject({
      columns: 6,
      rows: 3,
    });
    expect(terminal.getSnapshot().lines).toEqual(['      ', '      ', '      ']);
  });

  it('replays the visible terminal output when the geometry changes', () => {
    const terminal = new TerminalDevice({ columns: 4, rows: 2 });

    'AB'.split('').forEach((char) => terminal.writeByte(char.charCodeAt(0)));
    terminal.resize(6, 3);

    expect(terminal.getTerminalMeta()).toMatchObject({
      columns: 6,
      rows: 3,
      cursorRow: 0,
      cursorColumn: 2,
      output: 'AB',
    });
    expect(terminal.getSnapshot().lines).toEqual(['AB    ', '      ', '      ']);
    expect(terminal.getText()).toBe('AB    \n      \n      ');
  });
});
