import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ReducerInterpreterSession } from './session';

const nibblesPath = fileURLToPath(new URL('../../../examples/nibbles.asm', import.meta.url));

describe('interpreter-redux nibbles intro', () => {
  it(
    'boots nibbles.asm to the intro screen and waits for input',
    () => {
      const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
      const session = new ReducerInterpreterSession(sourceBytes);

      let lastRenderedText = '';
      let step = 0;
      for (; step < 200000; step += 1) {
        session.emulationStep();
        if (step % 5000 === 0) {
          lastRenderedText = session.getTerminalSnapshot().lines.join('\n');
        }

        if (session.isWaitingForInput()) {
          lastRenderedText = session.getTerminalSnapshot().lines.join('\n');
          break;
        }
      }

      expect(step).toBeLessThan(200000);
      expect(session.getException()).toBeUndefined();
      expect(session.getErrors()).toEqual([]);
      expect(session.isWaitingForInput()).toBe(true);
      expect(lastRenderedText).toContain('Difficulty');
      expect(lastRenderedText).toContain('Programmed By Josh Henn');
    },
    120000
  );
});
