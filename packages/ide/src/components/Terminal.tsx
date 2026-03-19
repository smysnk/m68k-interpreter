import React, { useEffect, useRef } from 'react';
import {
  RetroLcd,
  createRetroLcdController,
  type RetroLcdController,
} from 'react-retro-display-tty-ansi';
import { useTheme } from 'styled-components';
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
  const previousOutputRef = useRef('');
  const { emulatorInstance, terminalSnapshot, executionState } = useEmulatorStore();
  const theme = useTheme();

  if (controllerRef.current === null) {
    controllerRef.current = createRetroLcdController({
      rows: terminalSnapshot.rows,
      cols: terminalSnapshot.columns,
      scrollback: 4096,
      cursorMode: 'hollow',
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }

    const nextOutput = terminalSnapshot.output;
    const previousOutput = previousOutputRef.current;

    if (nextOutput === previousOutput) {
      return;
    }

    if (!nextOutput || nextOutput.length < previousOutput.length || !nextOutput.startsWith(previousOutput)) {
      controller.reset();
      if (nextOutput.length > 0) {
        controller.write(nextOutput);
      }
    } else {
      controller.write(nextOutput.slice(previousOutput.length));
    }

    previousOutputRef.current = nextOutput;
  }, [terminalSnapshot.output]);

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
          mode="terminal"
        />
      </div>
    </section>
  );
};

export default Terminal;
