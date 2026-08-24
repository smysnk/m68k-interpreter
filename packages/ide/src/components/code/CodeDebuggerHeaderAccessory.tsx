import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsisVertical, faUndo } from '@fortawesome/free-solid-svg-icons';
import { shallowEqual, useSelector } from 'react-redux';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';
import { executionCoordinator, type ExecutionCommand } from '@/runtime/executionCoordinator';
import {
  recordDebuggerPauseRequest,
  useIdeRenderTelemetry,
} from '@/runtime/idePerformanceTelemetry';
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

function DebugPauseButton({
  canPause,
  pauseRequested,
  onPause,
}: DebugPauseButtonProps): React.ReactElement {
  const disabled = !canPause || pauseRequested;
  return (
    <button
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
    controlsExpanded,
    canStepBackward,
    canStepOver,
    canStepInto,
    canStepOut,
    runToAddress,
  } = useSelector(selectCodeDebuggerControlModel, shallowEqual);
  const [pauseRequested, setPauseRequested] = React.useState(false);

  const closeOverflow = (): void => setOverflowAnchor(null);
  const runToCursor = (): void => {
    if (runToAddress !== undefined) executionCoordinator.runToAddress(runToAddress);
  };

  React.useEffect(() => {
    if (controlsExpanded || !canPause) setPauseRequested(false);
    if (!controlsExpanded) closeOverflow();
  }, [canPause, controlsExpanded]);

  React.useEffect(() => {
    if (!pauseRequested) return;
    const timeout = window.setTimeout(() => setPauseRequested(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [pauseRequested]);

  const pauseForDebugging = (): void => {
    if (!canPause || pauseRequested) return;
    setPauseRequested(true);
    recordDebuggerPauseRequest();
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
          pauseRequested={pauseRequested}
        />
      )}
      <div
        aria-hidden={!controlsExpanded}
        className="code-debugger-command-rail"
        inert={!controlsExpanded}
      >
        <div className="code-debugger-command-rail-inner">
          {!compact ? (
            <DebugCommandButton
              command="stepBack"
              disabled={!canStepBackward}
              label="Step backward"
              shortcut="Alt+F11"
              symbol={<FontAwesomeIcon icon={faUndo} size="xs" />}
            />
          ) : null}
          <DebugCommandButton
            command="stepOver"
            disabled={!canStepOver}
            label="Step over"
            shortcut="F10"
            symbol="↷"
          />
          <DebugCommandButton
            command="stepInto"
            disabled={!canStepInto}
            label="Step into"
            shortcut="F11"
            symbol="↓"
          />
          {!compact ? (
            <>
              <DebugCommandButton
                command="stepOut"
                disabled={!canStepOut}
                label="Step out"
                shortcut="Shift+F11"
                symbol="↑"
              />
              <DebugCommandButton
                disabled={runToAddress === undefined}
                label="Run to cursor"
                onClick={runToCursor}
                shortcut="Ctrl/Cmd+F10"
                symbol="◎"
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
            disabled={!canStepBackward}
            label="Step backward"
            meta="Alt+F11"
            onClick={() => {
              executionCoordinator.execute('stepBack');
              closeOverflow();
            }}
          />
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
