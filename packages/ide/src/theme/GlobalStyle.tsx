import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  :root {
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
    background-color: var(--background-color);
    color: var(--text-color);
    font-family: var(--font-family);
  }

  #root {
    min-height: 100%;
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
