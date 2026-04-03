import React, { useEffect, useRef, useState } from 'react';
import type { ExecutionState } from '@m68k/interpreter';
import {
  RetroLcd,
  createRetroLcdController,
  type RetroLcdGeometry,
  type RetroLcdController,
} from 'react-retro-display-tty-ansi';
import { useTheme } from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import {
  buildTerminalAnsiFullRedraw,
  buildTerminalAnsiRowPatch,
} from '@/runtime/terminalAnsiPatch';
import {
  dispatchRuntimeTouchCell,
  dispatchRuntimeTouchCellAsync,
  resolveTerminalInputMode,
  syncRuntimeGeometryBridge,
} from '@/runtime/terminalProgramBridge';
import { buildTerminalTouchCellEvent, shouldHandleTerminalPointer } from '@/runtime/terminalTouchAdapter';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import type { TerminalTouchPhase } from '@/runtime/terminalTouchProtocol';
import {
  createTerminalGeometrySignature,
  normalizeTerminalGeometry,
} from '@/runtime/terminalGeometry';
import {
  recordInputAccepted,
  recordTerminalRepaint,
  recordInputProgressRequest,
  recordTouchDispatch,
  useIdeRenderTelemetry,
} from '@/runtime/idePerformanceTelemetry';
import { useTerminalSurface } from '@/runtime/useTerminalSurface';
import { useCompactShell } from '@/hooks/useCompactShell';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { NIBBLES_FILE_ID, selectActiveFileId } from '@/store/filesSlice';
import {
  requestResume,
  requestPulseResume,
  setTerminalState as setTerminalStateAction,
  type AppDispatch,
  type RootState,
} from '@/store';

type KeyboardLikeEvent = {
  key: string;
};

function isDisposedWorkerRuntimeError(error: unknown): boolean {
  return error instanceof Error && /disposed/i.test(error.message);
}

declare global {
  interface Window {
    __M68K_IDE_TEST_PENDING_INPUT__?: {
      dispatched?: boolean;
      hudMarkers: string[];
      inputs: Array<string | number>;
    };
  }
}

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
  emulatorInstance: IdeRuntimeSession | null,
  executionState: ExecutionState,
  event: KeyboardLikeEvent,
  requestResumeExecution: (mode: 'resume' | 'pulse') => void,
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
  if ('stopPropagation' in event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const inputStartedAtMs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  if (emulatorInstance.getRuntimeTransport?.() === 'worker' && emulatorInstance.controller) {
    void emulatorInstance.controller
      .requestQueueInput(input)
      .then(() => {
        recordInputAccepted();
        recordInputProgressRequest({ startedAtMs: inputStartedAtMs });
        if (shouldRequestVisualResume(emulatorInstance, executionState)) {
          requestResumeExecution(
            shouldRequestFullResume(emulatorInstance, executionState) ? 'resume' : 'pulse'
          );
        }
      })
      .catch(() => undefined);
  } else {
    emulatorInstance.queueInput(input);
    recordInputAccepted();
    recordInputProgressRequest({ startedAtMs: inputStartedAtMs });

    if (shouldRequestVisualResume(emulatorInstance, executionState)) {
      requestResumeExecution(
        shouldRequestFullResume(emulatorInstance, executionState) ? 'resume' : 'pulse'
      );
    }
  }

  return true;
}

function shouldRequestVisualResume(
  emulatorInstance: IdeRuntimeSession | null,
  executionState: ExecutionState
): boolean {
  return Boolean(emulatorInstance) && !executionState.ended;
}

function shouldRequestFullResume(
  emulatorInstance: IdeRuntimeSession | null,
  executionState: ExecutionState
): boolean {
  if (!emulatorInstance || executionState.ended) {
    return false;
  }

  return !executionState.started || executionState.stopped || emulatorInstance.isWaitingForInput?.() === true;
}

const Terminal: React.FC = () => {
  useIdeRenderTelemetry('Terminal');
  const dispatch = useDispatch<AppDispatch>();
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<RetroLcdController | null>(null);
  const previousGeometryVersionRef = useRef<number | null>(null);
  const previousVersionRef = useRef<number | null>(null);
  const previousCursorPositionRef = useRef<string>('');
  const geometryCommitTimeoutRef = useRef<number | null>(null);
  const lastMeasuredGeometrySignatureRef = useRef('');
  const hasCommittedMeasuredGeometryRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const emulatorInstance = useSelector((state: RootState) => state.emulator.emulatorInstance);
  const executionState = useSelector((state: RootState) => state.emulator.executionState);
  const { frameBuffer, meta, dirtyRows } = useTerminalSurface();
  const focusTerminalIntent = useSelector(
    (state: RootState) => state.emulator.runtimeIntents.focusTerminal
  );
  const terminalState = useSelector((state: RootState) => state.emulator.terminal);
  const activeFileId = useSelector((state: RootState) => selectActiveFileId(state));
  const terminalInputModePreference = useSelector(
    (state: RootState) => state.settings.terminalInputMode
  );
  const theme = useTheme();
  const isCompactShell = useCompactShell();
  const focusTerminalIntentRef = useRef(focusTerminalIntent);
  const effectiveTerminalInputMode = resolveTerminalInputMode({
    activeFileId,
    isCompactShell,
    preference: terminalInputModePreference,
  });
  const isTouchOnlyMode = effectiveTerminalInputMode === 'touch-only';
  const isNibblesScreen = activeFileId === NIBBLES_FILE_ID;

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
    const hasFullFramePatch = dirtyRows.length >= meta.rows && meta.rows > 0;

    if (geometryChanged) {
      controller.reset();
      controller.resize(meta.rows, meta.columns);
      previousGeometryVersionRef.current = meta.geometryVersion;
    }

    controller.setCursorVisible(!isNibblesScreen);

    const versionChanged = previousVersionRef.current !== meta.version;
    const shouldForceFullRedraw =
      versionChanged && (dirtyRows.length === 0 || hasFullFramePatch);

    if (geometryChanged || shouldForceFullRedraw) {
      const repaintStartedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (!geometryChanged && hasFullFramePatch) {
        controller.reset();
        controller.resize(meta.rows, meta.columns);
      }
      const redraw = buildTerminalAnsiFullRedraw(frameBuffer);
      if (redraw.length > 0) {
        controller.write(redraw);
        const repaintFinishedAt =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        recordTerminalRepaint({
          kind: 'full-redraw',
          durationMs: Math.max(0, repaintFinishedAt - repaintStartedAt),
          ansiBytes: redraw.length,
          rowsPatched: meta.rows,
        });
      }
    } else if (versionChanged && dirtyRows.length > 0) {
      const repaintStartedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const patch = buildTerminalAnsiRowPatch(frameBuffer, dirtyRows);
      if (patch.length > 0) {
        controller.write(patch);
        const repaintFinishedAt =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        recordTerminalRepaint({
          kind: 'row-patch',
          durationMs: Math.max(0, repaintFinishedAt - repaintStartedAt),
          ansiBytes: patch.length,
          rowsPatched: dirtyRows.length,
        });
      }
    }

    const cursorPosition = `${meta.cursorRow}:${meta.cursorColumn}`;
    if (geometryChanged || versionChanged || previousCursorPositionRef.current !== cursorPosition) {
      controller.moveCursorTo(meta.cursorRow, meta.cursorColumn);
      previousCursorPositionRef.current = cursorPosition;
    }

    previousVersionRef.current = meta.version;
  }, [
    dirtyRows,
    frameBuffer,
    isNibblesScreen,
    meta.columns,
    meta.cursorColumn,
    meta.cursorRow,
    meta.geometryVersion,
    meta.rows,
    meta.version,
  ]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isTouchOnlyMode) {
      return;
    }

    queueAssemblerInput(
      emulatorInstance,
      executionState,
      event,
      (resumeMode) => {
        dispatch(resumeMode === 'resume' ? requestResume() : requestPulseResume());
      },
      () => event.preventDefault()
    );
  };

  const focusTerminal = React.useCallback((): void => {
    if (isTouchOnlyMode) {
      return;
    }

    const viewport = terminalRef.current?.querySelector<HTMLDivElement>('.retro-lcd__viewport');
    viewport?.focus();
  }, [isTouchOnlyMode]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      if (isTouchOnlyMode) {
        return;
      }

      if (!isPageEligibleForAssemblerInput()) {
        return;
      }

      if (shouldIgnoreGlobalKeyboardEvent(event)) {
        return;
      }

      const overlayOpen =
        document.getElementById('navbar-app-menu') !== null;

      if (overlayOpen) {
        return;
      }

      queueAssemblerInput(
        emulatorInstance,
        executionState,
        event,
        (resumeMode) => {
          dispatch(resumeMode === 'resume' ? requestResume() : requestPulseResume());
        },
        () => event.preventDefault()
      );
    };

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [dispatch, emulatorInstance, executionState, isTouchOnlyMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const pendingInput = window.__M68K_IDE_TEST_PENDING_INPUT__;
    if (!pendingInput || pendingInput.dispatched || !emulatorInstance || executionState.ended) {
      return;
    }

    const terminalText =
      emulatorInstance.getTerminalLines?.().join('\n') ??
      emulatorInstance.getTerminalText?.() ??
      meta.output ??
      '';
    if (!pendingInput.hudMarkers.every((marker) => terminalText.includes(marker))) {
      return;
    }

    pendingInput.dispatched = true;
    const inputStartedAtMs =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    const queuePendingInputs = async (): Promise<void> => {
      try {
        if (emulatorInstance.getRuntimeTransport?.() === 'worker' && emulatorInstance.controller) {
          for (const input of pendingInput.inputs) {
            await emulatorInstance.controller.requestQueueInput(input);
          }
        } else {
          for (const input of pendingInput.inputs) {
            emulatorInstance.queueInput(input);
          }
        }

        recordInputAccepted();
        recordInputProgressRequest({ startedAtMs: inputStartedAtMs });

        if (shouldRequestVisualResume(emulatorInstance, executionState)) {
          dispatch(
            shouldRequestFullResume(emulatorInstance, executionState)
              ? requestResume()
              : requestPulseResume()
          );
        }
      } catch {
        pendingInput.dispatched = false;
      }
    };

    void queuePendingInputs();
  }, [dispatch, emulatorInstance, executionState, meta.output, meta.version]);

  useEffect(() => {
    if (focusTerminalIntent === focusTerminalIntentRef.current) {
      return;
    }

    focusTerminalIntentRef.current = focusTerminalIntent;
    focusTerminal();
  }, [focusTerminal, focusTerminalIntent]);

  useEffect(() => {
    lastMeasuredGeometrySignatureRef.current = createTerminalGeometrySignature(
      terminalState.columns,
      terminalState.rows
    );
  }, [terminalState.columns, terminalState.rows]);

  useEffect(() => {
    return () => {
      if (geometryCommitTimeoutRef.current !== null) {
        window.clearTimeout(geometryCommitTimeoutRef.current);
      }
    };
  }, []);

  const applyMeasuredGeometry = React.useCallback(
    async (columns: number, rows: number): Promise<void> => {
      if (terminalState.columns === columns && terminalState.rows === rows) {
        return;
      }

      if (isNibblesScreen) {
        terminalSurfaceStore.reset(columns, rows);
        dispatch(
          setTerminalStateAction({
            columns,
            rows,
            cursorRow: 0,
            cursorColumn: 0,
            version: terminalState.version + 1,
            geometryVersion: terminalState.geometryVersion + 1,
          })
        );
        return;
      }

      if (
        emulatorInstance?.getRuntimeTransport?.() === 'worker' &&
        emulatorInstance.controller !== undefined
      ) {
        try {
          await emulatorInstance.controller.requestResizeTerminal(columns, rows);
        } catch (error) {
          if (!isDisposedWorkerRuntimeError(error)) {
            throw error;
          }
          return;
        }
        terminalSurfaceStore.replaceFromRuntime(emulatorInstance);
        dispatch(setTerminalStateAction(emulatorInstance.getTerminalMeta()));
        return;
      }

      if (typeof emulatorInstance?.resizeTerminal === 'function') {
        emulatorInstance.resizeTerminal(columns, rows);
        syncRuntimeGeometryBridge(emulatorInstance, columns, rows);
        terminalSurfaceStore.replaceFromRuntime(emulatorInstance);
        dispatch(setTerminalStateAction(emulatorInstance.getTerminalMeta()));
        return;
      }

      terminalSurfaceStore.reset(columns, rows);
      dispatch(
        setTerminalStateAction({
          columns,
          rows,
          cursorRow: 0,
          cursorColumn: 0,
          version: terminalState.version + 1,
          geometryVersion: terminalState.geometryVersion + 1,
        })
      );
    },
    [
      dispatch,
      emulatorInstance,
      isNibblesScreen,
      terminalState.columns,
      terminalState.geometryVersion,
      terminalState.rows,
      terminalState.version,
    ]
  );

  const handleGeometryChange = React.useCallback(
    (geometry: RetroLcdGeometry): void => {
      const normalizedGeometry = normalizeTerminalGeometry(geometry);

      if (!normalizedGeometry) {
        return;
      }

      const nextSignature = createTerminalGeometrySignature(
        normalizedGeometry.columns,
        normalizedGeometry.rows
      );

      if (
        lastMeasuredGeometrySignatureRef.current === nextSignature &&
        hasCommittedMeasuredGeometryRef.current
      ) {
        return;
      }

      if (geometryCommitTimeoutRef.current !== null) {
        window.clearTimeout(geometryCommitTimeoutRef.current);
      }

      geometryCommitTimeoutRef.current = window.setTimeout(
        () => {
          geometryCommitTimeoutRef.current = null;
          hasCommittedMeasuredGeometryRef.current = true;
          lastMeasuredGeometrySignatureRef.current = nextSignature;
          void applyMeasuredGeometry(normalizedGeometry.columns, normalizedGeometry.rows);
        },
        isCompactShell ? 40 : 80
      );
    },
    [applyMeasuredGeometry, isCompactShell]
  );

  const handleTouchPointer = React.useCallback(
    async (
      event: React.PointerEvent<HTMLDivElement>,
      phase: TerminalTouchPhase
    ): Promise<void> => {
      if (!emulatorInstance) {
        return;
      }

      if (
        !shouldHandleTerminalPointer({
          isTouchOnlyMode,
          phase,
          pointerType: event.pointerType,
          buttons: event.buttons,
        })
      ) {
        return;
      }

      const touchEvent = buildTerminalTouchCellEvent({
        root: terminalRef.current,
        clientX: event.clientX,
        clientY: event.clientY,
        columns: meta.columns,
        rows: meta.rows,
        phase,
        pointerType: event.pointerType,
        buttons: event.buttons,
      });

      if (!touchEvent) {
        return;
      }

      if (phase === 'down') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures from unsupported pointer types in tests/browsers.
        }
      }

      if (phase === 'up') {
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore capture release failures.
        }
      }

      event.preventDefault();
      const touchDispatchStartedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

      const dispatched =
        emulatorInstance.getRuntimeTransport?.() === 'worker'
          ? await dispatchRuntimeTouchCellAsync(emulatorInstance, {
              ...touchEvent,
            })
          : dispatchRuntimeTouchCell(emulatorInstance, {
              ...touchEvent,
            });

      if (dispatched) {
        const touchDispatchFinishedAt =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        recordInputAccepted();
        recordTouchDispatch({
          startedAtMs: touchDispatchStartedAt,
          durationMs: Math.max(0, touchDispatchFinishedAt - touchDispatchStartedAt),
        });
        const isWorkerRuntime = emulatorInstance.getRuntimeTransport?.() === 'worker';
        if (!isWorkerRuntime) {
          syncRuntimeGeometryBridge(emulatorInstance, meta.columns, meta.rows);
          terminalSurfaceStore.replaceFromRuntime(emulatorInstance);
          dispatch(setTerminalStateAction(emulatorInstance.getTerminalMeta()));
        }

        if (shouldRequestVisualResume(emulatorInstance, executionState)) {
          dispatch(
            shouldRequestFullResume(emulatorInstance, executionState)
              ? requestResume()
              : requestPulseResume()
          );
        }
      }
    },
    [
      dispatch,
      emulatorInstance,
      executionState,
      isTouchOnlyMode,
      meta.columns,
      meta.rows,
    ]
  );

  return (
    <section className="terminal-container" data-terminal-theme={theme.surfaceMode}>
      <div
        ref={terminalRef}
        className="terminal-screen"
        data-terminal-focused={focused ? 'true' : 'false'}
        data-terminal-game-screen={isNibblesScreen ? 'true' : 'false'}
        data-terminal-input-mode={effectiveTerminalInputMode}
        data-testid="terminal-screen"
        onClick={focusTerminal}
        onPointerCancel={(event) => {
          void handleTouchPointer(event, 'up');
        }}
        onPointerDown={(event) => {
          void handleTouchPointer(event, 'down');
        }}
        onPointerMove={(event) => {
          void handleTouchPointer(event, 'move');
        }}
        onPointerUp={(event) => {
          void handleTouchPointer(event, 'up');
        }}
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
        {isTouchOnlyMode ? (
          <div
            className="terminal-touch-overlay"
            data-testid="terminal-touch-overlay"
            aria-hidden="true"
          />
        ) : null}
        <RetroLcd
          captureKeyboard={!isTouchOnlyMode}
          captureMouse={false}
          className="terminal-retro-lcd"
          controller={controllerRef.current}
          cursorMode="hollow"
          displayColorMode="ansi-extended"
          displayPadding={
            isCompactShell
              ? { top: 3, right: 5, bottom: 3, left: 5 }
              : { top: 4, right: 6, bottom: 4, left: 6 }
          }
          displaySurfaceMode={theme.surfaceMode}
          gridMode="auto"
          mode="terminal"
          onGeometryChange={handleGeometryChange}
        />
      </div>
    </section>
  );
};

export default Terminal;
