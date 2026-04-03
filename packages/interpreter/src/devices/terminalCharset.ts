const CP437_EXTENDED_TABLE = [
  'Ç', 'ü', 'é', 'â', 'ä', 'à', 'å', 'ç',
  'ê', 'ë', 'è', 'ï', 'î', 'ì', 'Ä', 'Å',
  'É', 'æ', 'Æ', 'ô', 'ö', 'ò', 'û', 'ù',
  'ÿ', 'Ö', 'Ü', '¢', '£', '¥', '₧', 'ƒ',
  'á', 'í', 'ó', 'ú', 'ñ', 'Ñ', 'ª', 'º',
  '¿', '⌐', '¬', '½', '¼', '¡', '«', '»',
  '░', '▒', '▓', '│', '┤', '╡', '╢', '╖',
  '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐',
  '└', '┴', '┬', '├', '─', '┼', '╞', '╟',
  '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧',
  '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫',
  '╪', '┘', '┌', '█', '▄', '▌', '▐', '▀',
  'α', 'ß', 'Γ', 'π', 'Σ', 'σ', 'µ', 'τ',
  'Φ', 'Θ', 'Ω', 'δ', '∞', 'φ', 'ε', '∩',
  '≡', '±', '≥', '≤', '⌠', '⌡', '÷', '≈',
  '°', '∙', '·', '√', 'ⁿ', '²', '■', ' ',
] as const;

const CP437_REVERSE_TABLE = new Map<string, number>(
  CP437_EXTENDED_TABLE.map((char, index) => [char, index + 0x80])
);

export function decodeTerminalByte(byte: number): string {
  const normalized = byte & 0xff;

  if (normalized <= 0x7f) {
    return String.fromCharCode(normalized);
  }

  return CP437_EXTENDED_TABLE[normalized - 0x80] ?? String.fromCharCode(normalized);
}

export function encodeTerminalByte(char: string | undefined): number {
  if (!char || char.length === 0) {
    return 0x20;
  }

  const normalized = char[0];
  const codePoint = normalized.codePointAt(0) ?? 0x20;

  if (codePoint <= 0x7f) {
    return codePoint;
  }

  return CP437_REVERSE_TABLE.get(normalized) ?? (codePoint & 0xff);
}
