import {
  createEmptyTerminalState,
  createTerminalStyleState,
  type TerminalState,
  type TerminalStyleState,
} from './state';

function cloneStyle(style: TerminalStyleState): TerminalStyleState {
  return {
    foreground: style.foreground,
    background: style.background,
    bold: style.bold,
    inverse: style.inverse,
  };
}

function isEscapeSequenceFinal(sequence: string, char: string): boolean {
  if (sequence === '[') {
    return false;
  }

  const code = char.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}

function normalizeCursorCoordinate(value: number, max: number): number {
  if (value <= 0) {
    return 0;
  }

  return Math.min(max - 1, value - 1);
}

function clearScreen(state: TerminalState): void {
  state.cursorRow = 0;
  state.cursorColumn = 0;
}

function applyGraphicsMode(
  state: TerminalState,
  params: number[],
  ensureMutableStyle: () => void
): void {
  const effectiveParams = params.length === 0 ? [0] : params;

  for (const param of effectiveParams) {
    if (param === 0) {
      state.style = createTerminalStyleState();
      continue;
    }

    if (param === 1) {
      ensureMutableStyle();
      state.style.bold = true;
      continue;
    }

    if (param === 7) {
      ensureMutableStyle();
      state.style.inverse = true;
      continue;
    }

    if (param === 22) {
      ensureMutableStyle();
      state.style.bold = false;
      continue;
    }

    if (param === 27) {
      ensureMutableStyle();
      state.style.inverse = false;
      continue;
    }

    if (param === 39) {
      ensureMutableStyle();
      state.style.foreground = null;
      continue;
    }

    if (param === 49) {
      ensureMutableStyle();
      state.style.background = null;
      continue;
    }

    if (param >= 30 && param <= 37) {
      ensureMutableStyle();
      state.style.foreground = param;
      continue;
    }

    if (param >= 40 && param <= 47) {
      ensureMutableStyle();
      state.style.background = param;
    }
  }
}

function applyEscapeSequence(
  state: TerminalState,
  sequence: string,
  ensureMutableStyle: () => void
): void {
  if (!sequence.startsWith('[')) {
    return;
  }

  const finalChar = sequence.charAt(sequence.length - 1);
  const paramsText = sequence.slice(1, -1);
  const params =
    paramsText === ''
      ? []
      : paramsText.split(';').map((part) => {
          const parsed = parseInt(part, 10);
          return Number.isNaN(parsed) ? 0 : parsed;
        });

  switch (finalChar) {
    case 'A':
      state.cursorRow = Math.max(0, state.cursorRow - (params[0] || 1));
      break;
    case 'B':
      state.cursorRow = Math.min(state.rows - 1, state.cursorRow + (params[0] || 1));
      break;
    case 'C':
      state.cursorColumn = Math.min(state.columns - 1, state.cursorColumn + (params[0] || 1));
      break;
    case 'D':
      state.cursorColumn = Math.max(0, state.cursorColumn - (params[0] || 1));
      break;
    case 'H':
    case 'f': {
      const row = params[0] ?? 1;
      const column = params[1] ?? 1;
      state.cursorRow = normalizeCursorCoordinate(row, state.rows);
      state.cursorColumn = normalizeCursorCoordinate(column, state.columns);
      break;
    }
    case 'J':
      if ((params[0] ?? 0) === 2) {
        clearScreen(state);
      }
      break;
    case 'm':
      applyGraphicsMode(state, params, ensureMutableStyle);
      break;
    default:
      break;
  }
}

function advanceLine(state: TerminalState): void {
  if (state.cursorRow === state.rows - 1) {
    return;
  }

  state.cursorRow += 1;
}

function wrapCursor(state: TerminalState): void {
  state.cursorColumn = 0;
  advanceLine(state);
}

function writeCharacter(state: TerminalState): void {
  if (state.cursorRow < 0 || state.cursorRow >= state.rows) {
    return;
  }

  if (state.cursorColumn < 0 || state.cursorColumn >= state.columns) {
    wrapCursor(state);
  }

  state.cursorColumn += 1;
  if (state.cursorColumn >= state.columns) {
    wrapCursor(state);
  }
}

export function resetTerminalState(state: TerminalState): TerminalState {
  return createEmptyTerminalState(state.columns, state.rows);
}

export function resizeTerminalState(
  state: TerminalState,
  columns: number,
  rows: number
): TerminalState {
  if (columns === state.columns && rows === state.rows) {
    return state;
  }

  return createEmptyTerminalState(columns, rows);
}

export function writeTerminalByte(state: TerminalState, value: number): TerminalState {
  const nextState: TerminalState = {
    columns: state.columns,
    rows: state.rows,
    cursorRow: state.cursorRow,
    cursorColumn: state.cursorColumn,
    style: state.style,
    escapeBuffer: state.escapeBuffer,
    output: state.output,
  };
  const byte = value & 0xff;
  const char = String.fromCharCode(byte);
  nextState.output += char;
  let styleIsMutable = false;
  const ensureMutableStyle = (): void => {
    if (styleIsMutable) {
      return;
    }

    nextState.style = cloneStyle(nextState.style);
    styleIsMutable = true;
  };

  if (nextState.escapeBuffer !== null) {
    nextState.escapeBuffer += char;
    if (isEscapeSequenceFinal(nextState.escapeBuffer, char)) {
      applyEscapeSequence(nextState, nextState.escapeBuffer, ensureMutableStyle);
      nextState.escapeBuffer = null;
    }
    return nextState;
  }

  if (byte === 0x1b) {
    nextState.escapeBuffer = '';
    return nextState;
  }

  if (byte === 0x0d) {
    nextState.cursorColumn = 0;
    return nextState;
  }

  if (byte === 0x0a) {
    advanceLine(nextState);
    return nextState;
  }

  if (byte === 0x08) {
    nextState.cursorColumn = Math.max(0, nextState.cursorColumn - 1);
    return nextState;
  }

  if (byte === 0x00) {
    return nextState;
  }

  writeCharacter(nextState);
  return nextState;
}

export function writeTerminalBytes(
  state: TerminalState,
  values: Iterable<number>
): TerminalState {
  let nextState = state;

  for (const value of values) {
    nextState = writeTerminalByte(nextState, value);
  }

  return nextState;
}
