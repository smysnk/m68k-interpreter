import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import { shallowEqual, useSelector } from 'react-redux';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';
import { executionCoordinator, type ExecutionCommand } from '@/runtime/executionCoordinator';
import { useIdeRenderTelemetry } from '@/runtime/idePerformanceTelemetry';
import { selectCodeDebuggerControlModel } from '@/store/codeDebuggerSelectors';
import type { MenuAnchor } from '@/components/menus/useMenuPosition';

const COMPACT_HEADER_WIDTH = 470;

interface DebugCommandButtonProps {
  command?: ExecutionCommand;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  shortcut: string;
  symbol: React.ReactNode;
}

interface DebugPauseButtonProps {
  canPause: boolean;
  pauseRequested: boolean;
  onPause(): void;
}

type DebugCommandIconKind = 'into' | 'out' | 'over' | 'run-to-cursor';

function DebugCommandIcon({ kind }: { kind: DebugCommandIconKind }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="code-debugger-command-icon"
      data-debug-command-icon={kind}
      focusable="false"
      viewBox="0 0 16 16"
    >
      {kind === 'run-to-cursor' ? (
        <>
          <path d="M3.25 2.75v10.5L11.75 8 3.25 2.75Z" />
          <path d="M12.5 15v-5" />
          <path d="m10.25 12.25 2.25-2.25 2.25 2.25" />
        </>
      ) : kind === 'over' ? (
        <>
          <path d="M2.5 8.25C3 4.85 5.1 3 8 3c2.1 0 3.75.85 4.9 2.55" />
          <path d="M10.35 5.55h2.6V2.9" />
        </>
      ) : kind === 'into' ? (
        <>
          <path d="M8 1.5v7.25" />
          <path d="m4.75 5.5 3.25 3.25 3.25-3.25" />
        </>
      ) : (
        <>
          <path d="M8 9.25V2" />
          <path d="M4.75 5.25 8 2l3.25 3.25" />
        </>
      )}
      {kind !== 'run-to-cursor' ? <circle cx="8" cy="13" r="1.55" /> : null}
    </svg>
  );
}

function DebugPauseButton({
  canPause,
  pauseRequested,
  onPause,
}: DebugPauseButtonProps): React.ReactElement {
  const disabled = !canPause || pauseRequested;
  return (
    <button
      aria-busy={pauseRequested}
      aria-label="Pause for debugging"
      className="code-debugger-pause-button"
      disabled={disabled}
      onClick={onPause}
      title={
        pauseRequested
          ? 'Pausing at the next instruction boundary'
          : canPause
            ? 'Pause for debugging'
            : 'Start the program before pausing for debugging'
      }
      type="button"
    >
      Debug
    </button>
  );
}

function DebugCommandButton({
  command,
  disabled = false,
  label,
  onClick,
  shortcut,
  symbol,
}: DebugCommandButtonProps): React.ReactElement {
  return (
    <button
      aria-label={label}
      className="code-debugger-header-button"
      disabled={disabled}
      onClick={() => {
        if (onClick) onClick();
        else if (command) executionCoordinator.execute(command);
      }}
      title={`${label} (${shortcut})`}
      type="button"
    >
      <span aria-hidden="true" className="code-debugger-command-symbol">
        {symbol}
      </span>
    </button>
  );
}

function useCompactCodeHeader(rootRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    const root = rootRef.current;
    const header = root?.closest('.panel-frame-header');
    if (!(header instanceof HTMLElement)) return;

    const update = (): void => {
      const width = header.getBoundingClientRect().width;
      if (width > 0) setCompact(width < COMPACT_HEADER_WIDTH);
    };
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [rootRef]);

  return compact;
}

function CodeDebuggerHeaderAccessory(): React.ReactElement {
  useIdeRenderTelemetry('CodeDebuggerHeaderAccessory');
  const rootRef = React.useRef<HTMLDivElement>(null);
  const overflowButtonRef = React.useRef<HTMLButtonElement>(null);
  const overflowMenuRef = React.useRef<HTMLDivElement>(null);
  const [overflowAnchor, setOverflowAnchor] = React.useState<Extract<
    MenuAnchor,
    { kind: 'element' }
  > | null>(null);
  const compact = useCompactCodeHeader(rootRef);
  const {
    canPause,
    pauseRequestPending,
    controlsExpanded,
    canStepOver,
    canStepInto,
    canStepOut,
    runToAddress,
  } = useSelector(selectCodeDebuggerControlModel, shallowEqual);

  const closeOverflow = (): void => setOverflowAnchor(null);
  const runToCursor = (): void => {
    if (runToAddress !== undefined) executionCoordinator.runToAddress(runToAddress);
  };

  React.useEffect(() => {
    if (!controlsExpanded) closeOverflow();
  }, [controlsExpanded]);

  const pauseForDebugging = (): void => {
    if (!canPause) return;
    executionCoordinator.execute('pause');
  };

  return (
    <div
      aria-label="Code debugging controls"
      className="code-debugger-header-controls"
      data-compact={compact ? 'true' : 'false'}
      data-expanded={controlsExpanded ? 'true' : 'false'}
      ref={rootRef}
      role="toolbar"
    >
      {controlsExpanded ? (
        <span aria-hidden="true" className="code-debugger-header-label">
          Debug
        </span>
      ) : (
        <DebugPauseButton
          canPause={canPause}
          onPause={pauseForDebugging}
          pauseRequested={pauseRequestPending}
        />
      )}
      <div
        aria-hidden={!controlsExpanded}
        className="code-debugger-command-rail"
        inert={!controlsExpanded}
      >
        <div className="code-debugger-command-rail-inner">
          <DebugCommandButton
            command="stepOver"
            disabled={!canStepOver}
            label="Step over"
            shortcut="F10"
            symbol={<DebugCommandIcon kind="over" />}
          />
          <DebugCommandButton
            command="stepInto"
            disabled={!canStepInto}
            label="Step into"
            shortcut="F11"
            symbol={<DebugCommandIcon kind="into" />}
          />
          {!compact ? (
            <>
              <DebugCommandButton
                command="stepOut"
                disabled={!canStepOut}
                label="Step out"
                shortcut="Shift+F11"
                symbol={<DebugCommandIcon kind="out" />}
              />
              <DebugCommandButton
                disabled={runToAddress === undefined}
                label="Run to cursor"
                onClick={runToCursor}
                shortcut="Ctrl/Cmd+F10"
                symbol={<DebugCommandIcon kind="run-to-cursor" />}
              />
            </>
          ) : (
            <button
              aria-expanded={overflowAnchor !== null}
              aria-haspopup="menu"
              aria-label="More debugging controls"
              className="code-debugger-header-button"
              onClick={() => {
                const element = overflowButtonRef.current;
                setOverflowAnchor((current) =>
                  current || !element ? null : { element, kind: 'element' }
                );
              }}
              ref={overflowButtonRef}
              title="More debugging controls"
              type="button"
            >
              <FontAwesomeIcon aria-hidden="true" icon={faEllipsisVertical} size="xs" />
            </button>
          )}
        </div>
      </div>
      {compact ? (
        <ContextMenu
          anchor={overflowAnchor}
          id="code-debugger-overflow-menu"
          label="More debugging controls"
          menuRef={overflowMenuRef}
          onDismiss={closeOverflow}
          open={controlsExpanded && overflowAnchor !== null}
          placement="block"
          relatedRefs={[overflowButtonRef]}
          restoreFocusTo={overflowButtonRef.current}
          width={220}
        >
          <MenuItem
            disabled={!canStepOut}
            label="Step out"
            meta="Shift+F11"
            onClick={() => {
              executionCoordinator.execute('stepOut');
              closeOverflow();
            }}
          />
          <MenuItem
            disabled={runToAddress === undefined}
            label="Run to cursor"
            meta="Ctrl/Cmd+F10"
            onClick={() => {
              runToCursor();
              closeOverflow();
            }}
          />
        </ContextMenu>
      ) : null}
    </div>
  );
}

export default React.memo(CodeDebuggerHeaderAccessory);
