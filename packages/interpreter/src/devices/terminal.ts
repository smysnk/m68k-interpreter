export interface TerminalStyle {
  foreground: number | null;
  background: number | null;
  bold: boolean;
  inverse: boolean;
}

export interface TerminalCell extends TerminalStyle {
  char: string;
}

export interface TerminalSnapshot {
  columns: number;
  rows: number;
  cursorRow: number;
  cursorColumn: number;
  output: string;
  lines: string[];
  cells: TerminalCell[][];
}

export interface TerminalDeviceConfig {
  columns?: number;
  rows?: number;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 25;

function createStyle(): TerminalStyle {
  return {
    foreground: null,
    background: null,
    bold: false,
    inverse: false,
  };
}

function cloneStyle(style: TerminalStyle): TerminalStyle {
  return {
    foreground: style.foreground,
    background: style.background,
    bold: style.bold,
    inverse: style.inverse,
  };
}

function createCell(style: TerminalStyle): TerminalCell {
  return {
    char: ' ',
    ...cloneStyle(style),
  };
}

export class TerminalDevice {
  private readonly columns: number;
  private readonly rows: number;
  private cursorRow = 0;
  private cursorColumn = 0;
  private output = '';
  private cells: TerminalCell[][];
  private style: TerminalStyle = createStyle();
  private escapeBuffer: string | null = null;

  constructor(config: TerminalDeviceConfig = {}) {
    this.columns = config.columns ?? DEFAULT_COLUMNS;
    this.rows = config.rows ?? DEFAULT_ROWS;
    this.cells = this.createGrid();
  }

  reset(): void {
    this.cursorRow = 0;
    this.cursorColumn = 0;
    this.output = '';
    this.style = createStyle();
    this.escapeBuffer = null;
    this.cells = this.createGrid();
  }

  writeByte(value: number): void {
    const byte = value & 0xff;
    const char = String.fromCharCode(byte);
    this.output += char;

    if (this.escapeBuffer !== null) {
      this.escapeBuffer += char;
      if (this.isEscapeSequenceFinal(this.escapeBuffer, char)) {
        this.applyEscapeSequence(this.escapeBuffer);
        this.escapeBuffer = null;
      }
      return;
    }

    if (byte === 0x1b) {
      this.escapeBuffer = '';
      return;
    }

    if (byte === 0x0d) {
      this.cursorColumn = 0;
      return;
    }

    if (byte === 0x0a) {
      this.advanceLine();
      return;
    }

    if (byte === 0x08) {
      this.cursorColumn = Math.max(0, this.cursorColumn - 1);
      return;
    }

    if (byte === 0x00) {
      return;
    }

    this.writeCharacter(char);
  }

  getSnapshot(): TerminalSnapshot {
    const cells = this.cells.map((row) =>
      row.map((cell) => ({
        char: cell.char,
        foreground: cell.foreground,
        background: cell.background,
        bold: cell.bold,
        inverse: cell.inverse,
      }))
    );

    return {
      columns: this.columns,
      rows: this.rows,
      cursorRow: this.cursorRow,
      cursorColumn: this.cursorColumn,
      output: this.output,
      lines: cells.map((row) => row.map((cell) => cell.char).join('')),
      cells,
    };
  }

  private createGrid(): TerminalCell[][] {
    const baseStyle = createStyle();
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.columns }, () => createCell(baseStyle))
    );
  }

  private isEscapeSequenceFinal(sequence: string, char: string): boolean {
    if (sequence === '[') {
      return false;
    }

    const code = char.charCodeAt(0);
    return code >= 0x40 && code <= 0x7e;
  }

  private applyEscapeSequence(sequence: string): void {
    if (!sequence.startsWith('[')) {
      return;
    }

    const finalChar = sequence.charAt(sequence.length - 1);
    const paramsText = sequence.slice(1, -1);
    const params = paramsText === ''
      ? []
      : paramsText.split(';').map((part) => {
          const parsed = parseInt(part, 10);
          return Number.isNaN(parsed) ? 0 : parsed;
        });

    switch (finalChar) {
      case 'A':
        this.cursorRow = Math.max(0, this.cursorRow - (params[0] || 1));
        break;
      case 'B':
        this.cursorRow = Math.min(this.rows - 1, this.cursorRow + (params[0] || 1));
        break;
      case 'C':
        this.cursorColumn = Math.min(this.columns - 1, this.cursorColumn + (params[0] || 1));
        break;
      case 'D':
        this.cursorColumn = Math.max(0, this.cursorColumn - (params[0] || 1));
        break;
      case 'H':
      case 'f': {
        const row = params[0] ?? 1;
        const column = params[1] ?? 1;
        this.cursorRow = this.normalizeCursorCoordinate(row, this.rows);
        this.cursorColumn = this.normalizeCursorCoordinate(column, this.columns);
        break;
      }
      case 'J':
        if ((params[0] ?? 0) === 2) {
          this.clearScreen();
        }
        break;
      case 'm':
        this.applyGraphicsMode(params);
        break;
      default:
        break;
    }
  }

  private normalizeCursorCoordinate(value: number, max: number): number {
    if (value <= 0) {
      return 0;
    }

    return Math.min(max - 1, value - 1);
  }

  private clearScreen(): void {
    const clearedStyle = createStyle();
    this.cells = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.columns }, () => createCell(clearedStyle))
    );
    this.cursorRow = 0;
    this.cursorColumn = 0;
  }

  private applyGraphicsMode(params: number[]): void {
    const effectiveParams = params.length === 0 ? [0] : params;

    for (const param of effectiveParams) {
      if (param === 0) {
        this.style = createStyle();
        continue;
      }

      if (param === 1) {
        this.style.bold = true;
        continue;
      }

      if (param === 7) {
        this.style.inverse = true;
        continue;
      }

      if (param === 22) {
        this.style.bold = false;
        continue;
      }

      if (param === 27) {
        this.style.inverse = false;
        continue;
      }

      if (param === 39) {
        this.style.foreground = null;
        continue;
      }

      if (param === 49) {
        this.style.background = null;
        continue;
      }

      if (param >= 30 && param <= 37) {
        this.style.foreground = param;
        continue;
      }

      if (param >= 40 && param <= 47) {
        this.style.background = param;
      }
    }
  }

  private writeCharacter(char: string): void {
    if (this.cursorRow < 0 || this.cursorRow >= this.rows) {
      return;
    }

    if (this.cursorColumn < 0 || this.cursorColumn >= this.columns) {
      this.wrapCursor();
    }

    this.cells[this.cursorRow][this.cursorColumn] = {
      char,
      ...cloneStyle(this.style),
    };

    this.cursorColumn += 1;
    if (this.cursorColumn >= this.columns) {
      this.wrapCursor();
    }
  }

  private wrapCursor(): void {
    this.cursorColumn = 0;
    this.advanceLine();
  }

  private advanceLine(): void {
    if (this.cursorRow === this.rows - 1) {
      this.cells.shift();
      this.cells.push(Array.from({ length: this.columns }, () => createCell(createStyle())));
      return;
    }

    this.cursorRow += 1;
  }
}
