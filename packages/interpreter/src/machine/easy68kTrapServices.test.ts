import { describe, expect, it } from 'vitest';
import { Emulator } from '../core/emulator';

function run(emulator: Emulator, limit = 200): void {
  for (
    let index = 0;
    index < limit && !emulator.isHalted() && !emulator.getException();
    index += 1
  ) {
    emulator.emulationStep();
  }
}

describe('canonical Easy68K trap services', () => {
  it('dispatches graphics tasks from D0.B and returns get-pixel in D0.L', () => {
    const emulator = new Emulator(`
RESULT DC.L 0
START
  MOVE.L #$000000FF,D1
  MOVEQ #80,D0
  TRAP #15
  MOVE.W #12,D1
  MOVE.W #9,D2
  MOVEQ #82,D0
  TRAP #15
  MOVEQ #83,D0
  TRAP #15
  MOVE.L D0,RESULT
  MOVEQ #9,D0
  TRAP #15
  END START
`);
    run(emulator);
    expect(emulator.getException()).toBeUndefined();
    expect(
      Array.from(emulator.readMemoryRange(emulator.getSymbolAddress('RESULT') ?? 0, 4))
    ).toEqual([0, 0, 0, 0xff]);
    expect(emulator.consumeGraphicsPatch()).toMatchObject({ width: 640, height: 480 });
  });

  it('implements sound tasks 70 through the project asset manifest', () => {
    const emulator = new Emulator(
      `
PATH DC.B 'tone.wav',0
RESULT DC.W 0
START
  LEA PATH,A1
  MOVEQ #70,D0
  TRAP #15
  MOVE.W D0,RESULT
  MOVEQ #9,D0
  TRAP #15
  END START
`,
      {
        soundAssets: [
          {
            id: 'tone',
            path: 'tone.wav',
            bytes: (() => {
              const wav = new Uint8Array(44);
              wav.set(
                [...'RIFF'].map((character) => character.charCodeAt(0)),
                0
              );
              new DataView(wav.buffer).setUint32(4, 36, true);
              wav.set(
                [...'WAVE'].map((character) => character.charCodeAt(0)),
                8
              );
              wav.set(
                [...'fmt '].map((character) => character.charCodeAt(0)),
                12
              );
              new DataView(wav.buffer).setUint32(16, 16, true);
              wav.set(
                [...'data'].map((character) => character.charCodeAt(0)),
                36
              );
              return wav;
            })(),
          },
        ],
      }
    );
    run(emulator);
    expect(emulator.getException()).toBeUndefined();
    expect(emulator.getSoundSnapshot(true)?.voices).toHaveLength(1);
    expect(emulator.getSoundSnapshot()?.commandSequence).toBe(1);
  });

  it('rejects unsupported task numbers explicitly', () => {
    const emulator = new Emulator('START\n MOVEQ #69,D0\n TRAP #15\n END START');
    emulator.emulationStep();
    expect(emulator.stepInstruction()).toMatchObject({
      kind: 'exception',
      fault: { code: 'unsupported-easy68k-task' },
    });
  });
});
