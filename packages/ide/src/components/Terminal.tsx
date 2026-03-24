import React, { useEffect, useRef, useState } from 'react';
import {
  RetroLcd,
  createRetroLcdController,
  type RetroLcdController,
} from 'react-retro-display-tty-ansi';
import { useTheme } from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import {
  buildTerminalAnsiFullRedraw,
  buildTerminalAnsiRowPatch,
} from '@/runtime/terminalAnsiPatch';
import { useTerminalSurface } from '@/runtime/useTerminalSurface';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { requestResume, type AppDispatch, type RootState } from '@/store';

type KeyboardLikeEvent = {
  key: string;
};

function mapKeyboardEventToInput(event: KeyboardLikeEvent): string | number | null {
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

function shouldIgnoreGlobalKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest('[data-testid="terminal-screen"]')) {
    return true;
  }

  if (
    target.closest(
      [
        'input',
        'textarea',
        'select',
        'button',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '.cm-editor',
        '.cm-content',
        '.cm-scroller',
        '.navbar-menu',
        '.navbar-submenu',
        '.status-engine-menu',
      ].join(', ')
    )
  ) {
    return true;
  }

  return false;
}

function isPageEligibleForAssemblerInput(): boolean {
  if (document.visibilityState === 'hidden') {
    return false;
  }

  const isJsdom =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? /jsdom/i.test(navigator.userAgent)
      : false;

  if (isJsdom) {
    return true;
  }

  return document.hasFocus();
}

function queueAssemblerInput(
  emulatorInstance: ReturnType<typeof useEmulatorStore>['emulatorInstance'],
  executionState: ReturnType<typeof useEmulatorStore>['executionState'],
  event: KeyboardLikeEvent,
  requestResumeExecution: () => void,
  preventDefault?: () => void
): boolean {
  if (!emulatorInstance) {
    return false;
  }

  const input = mapKeyboardEventToInput(event);
  if (input === null) {
    return false;
  }

  preventDefault?.();
  emulatorInstance.queueInput(input);

  if (executionState.started && !executionState.ended) {
    requestResumeExecution();
  }

  return true;
}

const Terminal: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<RetroLcdController | null>(null);
  const previousGeometryVersionRef = useRef<number | null>(null);
  const previousVersionRef = useRef<number | null>(null);
  const previousCursorPositionRef = useRef<string>('');
  const [focused, setFocused] = useState(false);
  const { emulatorInstance, executionState } = useEmulatorStore();
  const { frameBuffer, meta, dirtyRows } = useTerminalSurface();
  const focusTerminalIntent = useSelector((state: RootState) => state.emulator.runtimeIntents.focusTerminal);
  const theme = useTheme();
  const focusTerminalIntentRef = useRef(focusTerminalIntent);

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
    queueAssemblerInput(
      emulatorInstance,
      executionState,
      event,
      () => dispatch(requestResume()),
      () => event.preventDefault()
    );
  };

  const focusTerminal = (): void => {
    const viewport = terminalRef.current?.querySelector<HTMLDivElement>('.retro-lcd__viewport');
    viewport?.focus();
  };

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      if (!isPageEligibleForAssemblerInput()) {
        return;
      }

      if (shouldIgnoreGlobalKeyboardEvent(event)) {
        return;
      }

      const overlayOpen =
        document.getElementById('navbar-app-menu') !== null ||
        document.getElementById('status-engine-menu') !== null;

      if (overlayOpen) {
        return;
      }

      queueAssemblerInput(
        emulatorInstance,
        executionState,
        event,
        () => dispatch(requestResume()),
        () => event.preventDefault()
      );
    };

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [dispatch, emulatorInstance, executionState]);

  useEffect(() => {
    if (focusTerminalIntent === focusTerminalIntentRef.current) {
      return;
    }

    focusTerminalIntentRef.current = focusTerminalIntent;
    focusTerminal();
  }, [focusTerminalIntent]);

  return (
    <section className="terminal-container" data-terminal-theme={theme.surfaceMode}>
      <div
        ref={terminalRef}
        className="terminal-screen"
        data-terminal-focused={focused ? 'true' : 'false'}
        data-testid="terminal-screen"
        onClick={focusTerminal}
        onFocusCapture={() => {
          setFocused(true);
        }}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }

          setFocused(false);
        }}
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
