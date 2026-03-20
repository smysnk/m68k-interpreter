import type { Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { createTheme } from '@uiw/codemirror-themes';

export const EditorThemeEnum = {
  M68K_LIGHT: 'M68K_LIGHT',
  M68K_DARK: 'M68K_DARK',
} as const;

export type EditorThemeId = (typeof EditorThemeEnum)[keyof typeof EditorThemeEnum];
export type IdeSurfaceMode = 'light' | 'dark';

export interface IdeThemePalette {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textSecondary: string;
  borderColor: string;
  successColor: string;
  dangerColor: string;
  warningColor: string;
  infoColor: string;
  shadow: string;
  shadowLg: string;
  mainContentAccent: string;
  mainContentTop: string;
  mainContentBottom: string;
  terminalShellStart: string;
  terminalShellEnd: string;
  terminalShellAccent: string;
  terminalShellBorder: string;
  terminalShellShadow: string;
  terminalTitleColor: string;
  terminalCopyColor: string;
  terminalMetaColor: string;
  terminalFocusButtonBg: string;
  terminalFocusButtonHover: string;
  terminalFocusButtonBorder: string;
  terminalFocusButtonColor: string;
  buttonHoverColor: string;
  buttonActiveColor: string;
  buttonActiveInset: string;
  successHoverColor: string;
  focusRingColor: string;
  editorSurfaceColor: string;
  tableHeaderColor: string;
  tableRowHoverColor: string;
  tableCellColor: string;
  infoSurfaceBg: string;
  infoSurfaceText: string;
  warningSurfaceBg: string;
  warningSurfaceText: string;
  dangerSurfaceBg: string;
  dangerSurfaceText: string;
  neutralSurfaceBg: string;
  memoryCellHoverBg: string;
  memoryCellHoverText: string;
  flagSetBg: string;
  flagSetText: string;
  flagClearBg: string;
  flagClearText: string;
  subtleSurfaceBg: string;
}

export interface IdeThemeDefinition {
  id: EditorThemeId;
  name: string;
  surfaceMode: IdeSurfaceMode;
  theme: Extension;
  settings: {
    background: string;
    foreground: string;
    fontFamily: string;
    gutterBackground: string;
    gutterForeground: string;
    gutterBorder: string;
    caret: string;
    selection: string;
    lineHighlight: string;
  };
  styles: Array<{
    tag: unknown;
    color?: string;
    fontStyle?: string;
    fontWeight?: string;
  }>;
  palette: IdeThemePalette;
}

export interface IdeShellThemeTokens {
  background: string;
  surface: string;
  surfaceStrong: string;
  panel: string;
  border: string;
  borderStrong: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  shadow: string;
  resizeHandle: string;
  statusGood: string;
  statusWarn: string;
  statusDanger: string;
}

function createIdeTheme(
  id: EditorThemeId,
  name: string,
  surfaceMode: IdeSurfaceMode,
  palette: IdeThemePalette,
  selection: string,
  lineHighlight: string
): IdeThemeDefinition {
  const settings = {
    background: palette.editorSurfaceColor,
    foreground: palette.textColor,
    fontFamily: "'Fira Code', 'JetBrains Mono', 'SFMono-Regular', 'Courier New', monospace",
    gutterBackground: palette.editorSurfaceColor,
    gutterForeground: palette.textSecondary,
    gutterBorder: palette.borderColor,
    caret: palette.primaryColor,
    selection,
    lineHighlight,
  };

  const styles = [
    { tag: [t.keyword, t.operatorKeyword, t.controlKeyword], color: palette.primaryColor, fontWeight: '700' },
    { tag: [t.comment, t.blockComment, t.lineComment], color: palette.textSecondary, fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string)], color: palette.successColor },
    { tag: [t.number, t.bool, t.atom], color: palette.warningColor },
    { tag: [t.operator, t.punctuation], color: palette.secondaryColor },
    { tag: [t.variableName, t.propertyName], color: palette.textColor },
    { tag: [t.definition(t.variableName), t.labelName], color: palette.infoColor, fontWeight: '700' },
    { tag: [t.typeName, t.className], color: palette.infoColor },
    { tag: [t.meta, t.processingInstruction], color: palette.secondaryColor },
    { tag: [t.invalid], color: palette.dangerColor },
  ];

  return {
    id,
    name,
    surfaceMode,
    settings,
    styles,
    palette,
    theme: createTheme({
      theme: surfaceMode,
      settings,
      styles,
    }),
  };
}

const lightPalette: IdeThemePalette = {
  primaryColor: '#007bff',
  secondaryColor: '#6c757d',
  backgroundColor: '#f5f5f5',
  surfaceColor: '#ffffff',
  textColor: '#212529',
  textSecondary: '#6c757d',
  borderColor: '#dee2e6',
  successColor: '#28a745',
  dangerColor: '#dc3545',
  warningColor: '#ffc107',
  infoColor: '#17a2b8',
  shadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  shadowLg: '0 4px 8px rgba(0, 0, 0, 0.15)',
  mainContentAccent: 'rgba(0, 123, 255, 0.08)',
  mainContentTop: 'rgba(255, 255, 255, 0.96)',
  mainContentBottom: 'rgba(246, 248, 251, 0.98)',
  terminalShellStart: 'rgba(255, 255, 255, 0.98)',
  terminalShellEnd: 'rgba(238, 244, 237, 0.98)',
  terminalShellAccent: 'rgba(69, 153, 96, 0.14)',
  terminalShellBorder: 'rgba(120, 147, 128, 0.38)',
  terminalShellShadow: '0 20px 30px rgba(128, 141, 132, 0.16)',
  terminalTitleColor: '#223428',
  terminalCopyColor: 'rgba(34, 52, 40, 0.78)',
  terminalMetaColor: 'rgba(34, 52, 40, 0.68)',
  terminalFocusButtonBg: 'rgba(53, 112, 74, 0.1)',
  terminalFocusButtonHover: 'rgba(53, 112, 74, 0.18)',
  terminalFocusButtonBorder: 'rgba(53, 112, 74, 0.28)',
  terminalFocusButtonColor: '#21452d',
  buttonHoverColor: '#0056b3',
  buttonActiveColor: '#004896',
  buttonActiveInset: 'inset 0 0 0 1px rgba(255, 255, 255, 0.24)',
  successHoverColor: '#218838',
  focusRingColor: 'rgba(0, 123, 255, 0.25)',
  editorSurfaceColor: '#f8f9fa',
  tableHeaderColor: '#f8f9fa',
  tableRowHoverColor: '#f8f9fa',
  tableCellColor: '#ffffff',
  infoSurfaceBg: '#eef4ff',
  infoSurfaceText: '#27456a',
  warningSurfaceBg: '#fff3cd',
  warningSurfaceText: '#856404',
  dangerSurfaceBg: '#f8d7da',
  dangerSurfaceText: '#721c24',
  neutralSurfaceBg: '#f0f0f0',
  memoryCellHoverBg: '#e7f3ff',
  memoryCellHoverText: '#007bff',
  flagSetBg: '#e8f5e9',
  flagSetText: '#2e7d32',
  flagClearBg: '#ffebee',
  flagClearText: '#c62828',
  subtleSurfaceBg: '#f5f5f5',
};

const darkPalette: IdeThemePalette = {
  primaryColor: '#5aa2ff',
  secondaryColor: '#9aa6b2',
  backgroundColor: '#0b1016',
  surfaceColor: '#121922',
  textColor: '#edf3fb',
  textSecondary: '#98a2ae',
  borderColor: '#253140',
  successColor: '#4ccd74',
  dangerColor: '#ff7589',
  warningColor: '#ffd36a',
  infoColor: '#6ad8f0',
  shadow: '0 2px 4px rgba(0, 0, 0, 0.28)',
  shadowLg: '0 10px 26px rgba(0, 0, 0, 0.36)',
  mainContentAccent: 'rgba(90, 162, 255, 0.12)',
  mainContentTop: 'rgba(19, 26, 36, 0.96)',
  mainContentBottom: 'rgba(10, 14, 20, 0.98)',
  terminalShellStart: 'rgba(10, 18, 15, 0.96)',
  terminalShellEnd: 'rgba(15, 26, 23, 0.98)',
  terminalShellAccent: 'rgba(114, 214, 152, 0.14)',
  terminalShellBorder: 'rgba(66, 94, 80, 0.45)',
  terminalShellShadow: '0 20px 30px rgba(10, 18, 15, 0.2)',
  terminalTitleColor: '#eff8e7',
  terminalCopyColor: 'rgba(219, 234, 213, 0.76)',
  terminalMetaColor: 'rgba(219, 234, 213, 0.68)',
  terminalFocusButtonBg: 'rgba(119, 217, 91, 0.16)',
  terminalFocusButtonHover: 'rgba(119, 217, 91, 0.28)',
  terminalFocusButtonBorder: 'rgba(119, 217, 91, 0.4)',
  terminalFocusButtonColor: '#dff0d1',
  buttonHoverColor: '#3e8ef5',
  buttonActiveColor: '#2d78da',
  buttonActiveInset: 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)',
  successHoverColor: '#36b764',
  focusRingColor: 'rgba(90, 162, 255, 0.32)',
  editorSurfaceColor: '#0f1620',
  tableHeaderColor: 'rgba(255, 255, 255, 0.04)',
  tableRowHoverColor: 'rgba(255, 255, 255, 0.03)',
  tableCellColor: 'rgba(10, 16, 22, 0.8)',
  infoSurfaceBg: 'rgba(25, 50, 92, 0.72)',
  infoSurfaceText: '#d5e6ff',
  warningSurfaceBg: 'rgba(97, 74, 14, 0.68)',
  warningSurfaceText: '#ffe9a8',
  dangerSurfaceBg: 'rgba(92, 28, 40, 0.72)',
  dangerSurfaceText: '#ffc0ca',
  neutralSurfaceBg: 'rgba(255, 255, 255, 0.05)',
  memoryCellHoverBg: 'rgba(90, 162, 255, 0.16)',
  memoryCellHoverText: '#dcecff',
  flagSetBg: 'rgba(51, 133, 76, 0.28)',
  flagSetText: '#9de3ad',
  flagClearBg: 'rgba(133, 47, 63, 0.28)',
  flagClearText: '#ffb2c0',
  subtleSurfaceBg: 'rgba(255, 255, 255, 0.04)',
};

export const editorThemes: Record<EditorThemeId, IdeThemeDefinition> = {
  [EditorThemeEnum.M68K_LIGHT]: createIdeTheme(
    EditorThemeEnum.M68K_LIGHT,
    'M68K Light',
    'light',
    lightPalette,
    'rgba(0, 123, 255, 0.18)',
    'rgba(0, 123, 255, 0.05)'
  ),
  [EditorThemeEnum.M68K_DARK]: createIdeTheme(
    EditorThemeEnum.M68K_DARK,
    'M68K Dark',
    'dark',
    darkPalette,
    'rgba(90, 162, 255, 0.26)',
    'rgba(90, 162, 255, 0.08)'
  ),
};

export const defaultEditorThemes: EditorThemeId[] = [
  EditorThemeEnum.M68K_LIGHT,
  EditorThemeEnum.M68K_DARK,
];

export const defaultEditorTheme = EditorThemeEnum.M68K_LIGHT;

export function resolveThemeForSurfaceMode(surfaceMode: IdeSurfaceMode): EditorThemeId {
  return surfaceMode === 'dark' ? EditorThemeEnum.M68K_DARK : EditorThemeEnum.M68K_LIGHT;
}

export function resolveShellTheme(theme: IdeThemeDefinition): IdeShellThemeTokens {
  const { palette, surfaceMode } = theme;
  const accentStrength = surfaceMode === 'dark' ? '18%' : '12%';
  const softStrength = surfaceMode === 'dark' ? '12%' : '8%';
  const shadow = palette.shadowLg;

  return {
    background: `radial-gradient(circle at 0% 0%, color-mix(in srgb, ${palette.primaryColor} ${accentStrength}, transparent), transparent 32%), radial-gradient(circle at 100% 0%, color-mix(in srgb, ${palette.infoColor} ${softStrength}, transparent), transparent 26%), linear-gradient(180deg, ${palette.mainContentTop}, ${palette.mainContentBottom})`,
    surface: `color-mix(in srgb, ${palette.surfaceColor} 92%, transparent)`,
    surfaceStrong: `color-mix(in srgb, ${palette.editorSurfaceColor} 96%, ${palette.surfaceColor})`,
    panel: `color-mix(in srgb, ${palette.surfaceColor} 88%, ${palette.backgroundColor})`,
    border: palette.borderColor,
    borderStrong: `color-mix(in srgb, ${palette.primaryColor} 22%, ${palette.borderColor})`,
    textMuted: palette.textSecondary,
    accent: palette.primaryColor,
    accentSoft: `color-mix(in srgb, ${palette.primaryColor} 14%, ${palette.surfaceColor})`,
    shadow,
    resizeHandle: `color-mix(in srgb, ${palette.primaryColor} 16%, ${palette.surfaceColor})`,
    statusGood: palette.successColor,
    statusWarn: palette.warningColor,
    statusDanger: palette.dangerColor,
  };
}
