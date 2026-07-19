import { describe, expect, it } from 'vitest';
import { Emulator } from './emulator';

describe('Emulator EASy68K device bus', () => {
  it('routes CPU writes and reads through the shared direction-aware address', () => {
    const emulator = new Emulator(`ORG $1000
 MOVE.B #$3C,$E00010
 MOVE.B $E00010,D0
END`);
    emulator.setHardwareToggle(7, true);
    emulator.setHardwareToggle(0, true);

    emulator.emulationStep();
    emulator.emulationStep();
    emulator.emulationStep();

    expect(emulator.getHardwareSnapshot().leds).toBe(0x3c);
    expect(emulator.getRegisters()[8] & 0xff).toBe(0x81);
  });

  it('splits host word and long writes into big-endian byte bus cycles', () => {
    const emulator = new Emulator('ORG $1000\nEND');
    emulator.writeMemoryWord(0xe00010, 0xabcd);
    emulator.writeMemoryLong(0xe00000, 0x7d000000);

    expect(emulator.getHardwareSnapshot()).toMatchObject({
      leds: 0xab,
      display: [0x7d, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(emulator.readMemoryRange(0xe00011, 1)[0]).toBe(0xcd);
  });

  it('restores output latches on undo without rolling back physical inputs', () => {
    const emulator = new Emulator(`ORG $1000
 MOVE.B #$01,$E00010
 MOVE.B #$02,$E00010
END`);
    emulator.setHardwareToggle(2, true);
    emulator.emulationStep();
    emulator.emulationStep();
    emulator.emulationStep();
    expect(emulator.getHardwareSnapshot().leds).toBe(2);

    emulator.undoFromStack();

    expect(emulator.getHardwareSnapshot()).toMatchObject({ leds: 1, switches: 4 });
  });

  it('clears outputs and buttons on reset while preserving toggles and configuration', () => {
    const emulator = new Emulator('ORG $1000\nEND');
    emulator.setHardwareToggle(5, true);
    emulator.setHardwareButton(1, true);
    emulator.writeMemoryByte(0xe00010, 0xff);

    emulator.reset();

    expect(emulator.getHardwareSnapshot()).toMatchObject({
      leds: 0,
      switches: 0x20,
      buttons: 0xff,
      config: { ledAddress: 0xe00010 },
    });
  });
});
