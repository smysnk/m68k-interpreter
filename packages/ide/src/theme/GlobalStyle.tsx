import { createGlobalStyle } from 'styled-components';
import { resolveShellTheme } from '@/theme/editorThemeRegistry';

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(color: string): string {
  const normalized = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  return '#3d78ff';
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(color);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return { h: hue / 6, s: saturation, l: lightness };
}

function hueToRgb(p: number, q: number, t: number): number {
  let hue = t;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) {
    const gray = clampChannel(l * 255);
    return rgbToHex(gray, gray, gray);
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const red = hueToRgb(p, q, h + 1 / 3);
  const green = hueToRgb(p, q, h);
  const blue = hueToRgb(p, q, h - 1 / 3);
  return rgbToHex(red * 255, green * 255, blue * 255);
}

function deriveRegisterGroupColors(primaryColor: string): {
  flags: string;
  data: string;
  address: string;
  control: string;
} {
  const { r, g, b } = hexToRgb(primaryColor);
  const { h, s, l } = rgbToHsl(r, g, b);
  const complementHue = (h + 0.5) % 1;
  const saturation = Math.max(0.48, Math.min(0.78, s * 0.94 + 0.12));
  const lightness = Math.max(0.44, Math.min(0.68, l * 0.86 + 0.08));

  const withOffset = (offsetDegrees: number) =>
    hslToHex((complementHue + offsetDegrees / 360 + 1) % 1, saturation, lightness);

  return {
    flags: withOffset(56),
    data: withOffset(-28),
    address: withOffset(0),
    control: withOffset(28),
  };
}

export const GlobalStyle = createGlobalStyle`
  :root {
    ${({ theme }) => {
      const shell = resolveShellTheme(theme);
      const registerGroupColors = deriveRegisterGroupColors(theme.palette.primaryColor);
      return `
        --ide-bg: ${shell.background};
        --ide-surface: ${shell.surface};
        --ide-surface-strong: ${shell.surfaceStrong};
        --ide-panel: ${shell.panel};
        --ide-border: ${shell.border};
        --ide-border-strong: ${shell.borderStrong};
        --ide-text-muted: ${shell.textMuted};
        --ide-accent: ${shell.accent};
        --ide-accent-soft: ${shell.accentSoft};
        --ide-shadow: ${shell.shadow};
        --ide-resize-handle: ${shell.resizeHandle};
        --ide-status-good: ${shell.statusGood};
        --ide-status-warn: ${shell.statusWarn};
        --ide-status-danger: ${shell.statusDanger};
        --register-group-flags: ${registerGroupColors.flags};
        --register-group-data: ${registerGroupColors.data};
        --register-group-address: ${registerGroupColors.address};
        --register-group-control: ${registerGroupColors.control};
      `;
    }}
    color-scheme: ${({ theme }) => theme.surfaceMode};
    --primary-color: ${({ theme }) => theme.palette.primaryColor};
    --secondary-color: ${({ theme }) => theme.palette.secondaryColor};
    --background-color: ${({ theme }) => theme.palette.backgroundColor};
    --surface-color: ${({ theme }) => theme.palette.surfaceColor};
    --text-color: ${({ theme }) => theme.palette.textColor};
    --text-secondary: ${({ theme }) => theme.palette.textSecondary};
    --border-color: ${({ theme }) => theme.palette.borderColor};
    --success-color: ${({ theme }) => theme.palette.successColor};
    --danger-color: ${({ theme }) => theme.palette.dangerColor};
    --warning-color: ${({ theme }) => theme.palette.warningColor};
    --info-color: ${({ theme }) => theme.palette.infoColor};
    --shadow: ${({ theme }) => theme.palette.shadow};
    --shadow-lg: ${({ theme }) => theme.palette.shadowLg};
    --main-content-accent: ${({ theme }) => theme.palette.mainContentAccent};
    --main-content-top: ${({ theme }) => theme.palette.mainContentTop};
    --main-content-bottom: ${({ theme }) => theme.palette.mainContentBottom};
    --terminal-shell-start: ${({ theme }) => theme.palette.terminalShellStart};
    --terminal-shell-end: ${({ theme }) => theme.palette.terminalShellEnd};
    --terminal-shell-accent: ${({ theme }) => theme.palette.terminalShellAccent};
    --terminal-shell-border: ${({ theme }) => theme.palette.terminalShellBorder};
    --terminal-shell-shadow: ${({ theme }) => theme.palette.terminalShellShadow};
    --terminal-title-color: ${({ theme }) => theme.palette.terminalTitleColor};
    --terminal-copy-color: ${({ theme }) => theme.palette.terminalCopyColor};
    --terminal-meta-color: ${({ theme }) => theme.palette.terminalMetaColor};
    --terminal-focus-button-bg: ${({ theme }) => theme.palette.terminalFocusButtonBg};
    --terminal-focus-button-hover: ${({ theme }) => theme.palette.terminalFocusButtonHover};
    --terminal-focus-button-border: ${({ theme }) => theme.palette.terminalFocusButtonBorder};
    --terminal-focus-button-color: ${({ theme }) => theme.palette.terminalFocusButtonColor};
    --button-hover-color: ${({ theme }) => theme.palette.buttonHoverColor};
    --button-active-color: ${({ theme }) => theme.palette.buttonActiveColor};
    --button-active-inset: ${({ theme }) => theme.palette.buttonActiveInset};
    --success-hover-color: ${({ theme }) => theme.palette.successHoverColor};
    --focus-ring-color: ${({ theme }) => theme.palette.focusRingColor};
    --editor-surface-color: ${({ theme }) => theme.palette.editorSurfaceColor};
    --table-header-color: ${({ theme }) => theme.palette.tableHeaderColor};
    --table-row-hover-color: ${({ theme }) => theme.palette.tableRowHoverColor};
    --table-cell-color: ${({ theme }) => theme.palette.tableCellColor};
    --info-surface-bg: ${({ theme }) => theme.palette.infoSurfaceBg};
    --info-surface-text: ${({ theme }) => theme.palette.infoSurfaceText};
    --warning-surface-bg: ${({ theme }) => theme.palette.warningSurfaceBg};
    --warning-surface-text: ${({ theme }) => theme.palette.warningSurfaceText};
    --danger-surface-bg: ${({ theme }) => theme.palette.dangerSurfaceBg};
    --danger-surface-text: ${({ theme }) => theme.palette.dangerSurfaceText};
    --neutral-surface-bg: ${({ theme }) => theme.palette.neutralSurfaceBg};
    --memory-cell-hover-bg: ${({ theme }) => theme.palette.memoryCellHoverBg};
    --memory-cell-hover-text: ${({ theme }) => theme.palette.memoryCellHoverText};
    --flag-set-bg: ${({ theme }) => theme.palette.flagSetBg};
    --flag-set-text: ${({ theme }) => theme.palette.flagSetText};
    --flag-clear-bg: ${({ theme }) => theme.palette.flagClearBg};
    --flag-clear-text: ${({ theme }) => theme.palette.flagClearText};
    --subtle-surface-bg: ${({ theme }) => theme.palette.subtleSurfaceBg};
  }

  html,
  body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    background: var(--ide-bg);
    color: var(--text-color);
    font-family: var(--font-family);
  }

  #root,
  #__next {
    min-height: 100%;
    background: var(--ide-bg);
  }

  .cm-theme,
  .cm-editor {
    height: 100%;
  }

  .cm-gutters {
    background: ${({ theme }) => theme.settings.gutterBackground};
    border-right: 1px solid ${({ theme }) => theme.settings.gutterBorder};
  }

  .cm-errorLineGutter {
    background: rgba(255, 0, 0, 0.2);
  }

  .cm-errorLine {
    background: rgba(255, 0, 0, 0.1);
  }
`;
