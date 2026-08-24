import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, keymap, placeholder, type ViewUpdate } from '@codemirror/view';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import { m68kLanguage } from '@/editor/m68kLanguage';
import { selectActiveFileContent, selectActiveFileId } from '@/store/filesSlice';
import { useEmulatorActions } from '@/stores/emulatorStore';
import {
  addSourceBreakpoint,
  clearBreakpoints,
  removeBreakpoint,
  toggleBreakpointEnabled,
  upsertBreakpoint,
  setEditorCursorPosition,
  type AppDispatch,
  type RootState,
} from '@/store';
import { createDebuggerEditorExtensions } from '@/editor/debuggerExtensions';
import { executionCoordinator } from '@/runtime/executionCoordinator';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';
import type { MenuAnchor } from '@/components/menus/useMenuPosition';

const Editor: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { setEditorCode } = useEmulatorActions();
  const editorCode = useSelector((state: RootState) => selectActiveFileContent(state));
  const activeFileId = useSelector((state: RootState) => selectActiveFileId(state));
  const lineNumbers = useSelector((state: RootState) => state.settings.lineNumbers);
  const debuggerConfiguration = useSelector((state: RootState) => state.debugger.configuration);
  const debugSnapshot = useSelector((state: RootState) => state.debugger.snapshot);
  const debugSourceStale = useSelector((state: RootState) => state.debugger.sourceStale);
  const theme = useTheme();
  const [breakpointMenu, setBreakpointMenu] = React.useState<{
    line: number;
    anchor: Extract<MenuAnchor, { kind: 'point' }>;
  } | null>(null);
  const breakpointMenuRef = React.useRef<HTMLDivElement>(null);

  const toggleBreakpoint = React.useCallback(
    (line: number): void => {
      dispatch(addSourceBreakpoint({ fileId: activeFileId, line }));
    },
    [activeFileId, dispatch]
  );

  const extensions = React.useMemo(() => {
    const debuggerStopped = debugSnapshot.status === 'paused' || debugSnapshot.status === 'waiting';
    const currentLine =
      !debugSourceStale && debuggerStopped && debugSnapshot.stop?.source?.fileId === activeFileId
        ? debugSnapshot.stop.source.line
        : undefined;
    return [
      m68kLanguage,
      EditorView.lineWrapping,
      placeholder('Enter M68K assembly code...'),
      ...createDebuggerEditorExtensions({
        breakpoints: debuggerConfiguration.breakpoints,
        resolvedBreakpoints: debugSnapshot.breakpoints,
        activeFileId,
        currentLine,
        showLineNumbers: lineNumbers,
        onToggleBreakpoint: toggleBreakpoint,
        onOpenBreakpointMenu: (line, x, y) =>
          setBreakpointMenu({ line, anchor: { kind: 'point', x, y } }),
      }),
      keymap.of([
        {
          key: 'F9',
          run: (view) => {
            toggleBreakpoint(view.state.doc.lineAt(view.state.selection.main.head).number);
            return true;
          },
        },
        {
          key: 'Mod-F10',
          run: (view) => {
            const line = view.state.doc.lineAt(view.state.selection.main.head).number;
            const address = debugSnapshot.program?.sourceMap.find(
              (entry) => entry.kind === 'instruction' && entry.line === line
            )?.address;
            if (address === undefined) return false;
            executionCoordinator.runToAddress(address);
            return true;
          },
        },
      ]),
    ];
  }, [
    activeFileId,
    debugSnapshot,
    debugSourceStale,
    debuggerConfiguration.breakpoints,
    lineNumbers,
    toggleBreakpoint,
  ]);

  const handleCodeChange = React.useCallback(
    (value: string): void => {
      setEditorCode(value);
    },
    [setEditorCode]
  );

  const handleUpdate = React.useCallback(
    (viewUpdate: ViewUpdate): void => {
      if (!viewUpdate.selectionSet && !viewUpdate.docChanged) {
        return;
      }

      const head = viewUpdate.state.selection.main.head;
      const line = viewUpdate.state.doc.lineAt(head);

      dispatch(
        setEditorCursorPosition({
          line: line.number,
          column: head - line.from + 1,
        })
      );
    },
    [dispatch]
  );

  return (
    <div className="editor-container pane-surface">
      <CodeMirror
        aria-label="M68K Assembly Editor"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          dropCursor: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
        }}
        className="editor-code-mirror"
        data-testid="assembly-editor"
        extensions={extensions}
        height="100%"
        onChange={handleCodeChange}
        onUpdate={handleUpdate}
        theme={theme.theme}
        value={editorCode}
      />
      <ContextMenu
        anchor={breakpointMenu?.anchor ?? null}
        id="editor-breakpoint-context-menu"
        label="Breakpoint actions"
        menuRef={breakpointMenuRef}
        onDismiss={() => setBreakpointMenu(null)}
        open={breakpointMenu !== null}
        placement="point"
        width={250}
      >
        {(() => {
          const breakpoint = debuggerConfiguration.breakpoints.find(
            (item) =>
              item.kind === 'source' &&
              item.fileId === activeFileId &&
              item.line === breakpointMenu?.line
          );
          if (!breakpoint) {
            return (
              <MenuItem
                label="Add breakpoint"
                onClick={() => {
                  if (breakpointMenu) toggleBreakpoint(breakpointMenu.line);
                  setBreakpointMenu(null);
                }}
              />
            );
          }
          return (
            <>
              <MenuItem
                label={breakpoint.enabled ? 'Disable breakpoint' : 'Enable breakpoint'}
                onClick={() => {
                  dispatch(toggleBreakpointEnabled(breakpoint.id));
                  setBreakpointMenu(null);
                }}
              />
              <MenuItem
                label="Edit condition…"
                onClick={() => {
                  const condition = window.prompt(
                    'Breakpoint condition',
                    breakpoint.condition ?? ''
                  );
                  if (condition !== null)
                    dispatch(
                      upsertBreakpoint({ ...breakpoint, condition: condition.trim() || undefined })
                    );
                  setBreakpointMenu(null);
                }}
              />
              <MenuItem
                label="Convert to logpoint…"
                onClick={() => {
                  const logMessage = window.prompt(
                    'Log message. Use {D0} or {(A0).W} for expressions.',
                    breakpoint.logMessage ?? ''
                  );
                  if (logMessage !== null)
                    dispatch(
                      upsertBreakpoint({
                        ...breakpoint,
                        logMessage: logMessage.trim() || undefined,
                      })
                    );
                  setBreakpointMenu(null);
                }}
              />
              <MenuItem
                label="Remove breakpoint"
                onClick={() => {
                  dispatch(removeBreakpoint(breakpoint.id));
                  setBreakpointMenu(null);
                }}
              />
              <MenuItem
                label="Remove all breakpoints"
                onClick={() => {
                  dispatch(clearBreakpoints());
                  setBreakpointMenu(null);
                }}
              />
            </>
          );
        })()}
      </ContextMenu>
    </div>
  );
};

export default Editor;
