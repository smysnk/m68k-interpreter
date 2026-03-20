import React, { useEffect, useRef } from 'react';
import {
  RetroLcd,
  createRetroLcdController,
  type RetroLcdController,
} from 'react-retro-display-tty-ansi';
import { useTheme } from 'styled-components';
import {
  buildTerminalAnsiFullRedraw,
  buildTerminalAnsiRowPatch,
} from '@/runtime/terminalAnsiPatch';
import { useTerminalSurface } from '@/runtime/useTerminalSurface';
import { useEmulatorStore } from '@/stores/emulatorStore';

function mapKeyboardEventToInput(event: React.KeyboardEvent<HTMLDivElement>): string | number | null {
  switch (event.key) {
    case 'ArrowUp':
      return 'w';
    case 'ArrowDown':
      return 's';
    case 'ArrowLeft':
      return 'a';
    case 'ArrowRight':
      return 'd';
    case 'Enter':
      return 0x0d;
    default:
      break;
  }

  if (event.key.length === 1) {
    return event.key.toLowerCase();
  }

  return null;
}

const Terminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<RetroLcdController | null>(null);
  const previousGeometryVersionRef = useRef<number | null>(null);
  const previousVersionRef = useRef<number | null>(null);
  const previousCursorPositionRef = useRef<string>('');
  const { emulatorInstance, executionState } = useEmulatorStore();
  const { frameBuffer, meta, dirtyRows } = useTerminalSurface();
  const theme = useTheme();

  if (controllerRef.current === null) {
    controllerRef.current = createRetroLcdController({
      rows: meta.rows,
      cols: meta.columns,
      scrollback: 4096,
      cursorMode: 'hollow',
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }

    const geometryChanged = previousGeometryVersionRef.current !== meta.geometryVersion;

    if (geometryChanged) {
      controller.reset();
      controller.resize(meta.rows, meta.columns);
      previousGeometryVersionRef.current = meta.geometryVersion;
    }

    const versionChanged = previousVersionRef.current !== meta.version;

    if (geometryChanged) {
      const redraw = buildTerminalAnsiFullRedraw(frameBuffer);
      if (redraw.length > 0) {
        controller.write(redraw);
      }
    } else if (versionChanged && dirtyRows.length > 0) {
      const patch = buildTerminalAnsiRowPatch(frameBuffer, dirtyRows);
      if (patch.length > 0) {
        controller.write(patch);
      }
    }

    const cursorPosition = `${meta.cursorRow}:${meta.cursorColumn}`;
    if (geometryChanged || versionChanged || previousCursorPositionRef.current !== cursorPosition) {
      controller.moveCursorTo(meta.cursorRow, meta.cursorColumn);
      previousCursorPositionRef.current = cursorPosition;
    }

    previousVersionRef.current = meta.version;
  }, [dirtyRows, frameBuffer, meta.columns, meta.cursorColumn, meta.cursorRow, meta.geometryVersion, meta.rows, meta.version]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!emulatorInstance) {
      return;
    }

    const input = mapKeyboardEventToInput(event);
    if (input === null) {
      return;
    }

    event.preventDefault();
    emulatorInstance.queueInput(input);

    if (executionState.started && !executionState.ended) {
      window.dispatchEvent(new CustomEvent('emulator:resume'));
    }
  };

  const focusTerminal = (): void => {
    const viewport = terminalRef.current?.querySelector<HTMLDivElement>('.retro-lcd__viewport');
    viewport?.focus();
  };

  useEffect(() => {
    const handleFocusTerminal = (): void => {
      focusTerminal();
    };

    window.addEventListener('emulator:focus-terminal', handleFocusTerminal);

    return () => {
      window.removeEventListener('emulator:focus-terminal', handleFocusTerminal);
    };
  }, []);

  return (
    <section className="terminal-container" data-terminal-theme={theme.surfaceMode}>
      <div
        ref={terminalRef}
        className="terminal-screen"
        data-testid="terminal-screen"
        onClick={focusTerminal}
        onKeyDown={handleKeyDown}
        role="application"
        aria-label="M68K terminal"
      >
        <RetroLcd
          className="terminal-retro-lcd"
          controller={controllerRef.current}
          cursorMode="hollow"
          displayColorMode="ansi-extended"
          displayPadding={{ top: 18, right: 20, bottom: 18, left: 20 }}
          displaySurfaceMode={theme.surfaceMode}
          gridMode="static"
          mode="terminal"
          rows={meta.rows}
          cols={meta.columns}
        />
      </div>
    </section>
  );
};

export default Terminal;
