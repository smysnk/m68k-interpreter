import { beforeEach, describe, expect, it } from 'vitest';
import {
  createIdeStore,
  resetHardwarePreferences,
  setAutomaticInterruptInterval,
  setHardwareConfig,
  toggleAutomaticInterruptLevel,
} from '@/store';
import { IDE_PERSISTENCE_KEY } from '@/store/persistence';

describe('hardware preferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('stores serializable configuration and automatic IRQ preferences', () => {
    const store = createIdeStore();
    store.dispatch(setHardwareConfig({
      displayBase: 0xe00100,
      ledAddress: 0xe00110,
      switchAddress: 0xe00110,
      buttonAddress: 0xe00112,
    }));
    store.dispatch(toggleAutomaticInterruptLevel(3));
    store.dispatch(setAutomaticInterruptInterval(10));

    expect(store.getState().hardware).toMatchObject({
      config: { displayBase: 0xe00100 },
      automaticInterruptLevels: [3],
      automaticInterruptIntervalMs: 50,
    });
    expect(JSON.parse(window.localStorage.getItem(IDE_PERSISTENCE_KEY) ?? '{}').hardware).toEqual({
      config: {
        displayBase: 0xe00100,
        ledAddress: 0xe00110,
        switchAddress: 0xe00110,
        buttonAddress: 0xe00112,
      },
      automaticInterruptLevels: [3],
      automaticInterruptIntervalMs: 50,
    });

    store.dispatch(resetHardwarePreferences());
    expect(store.getState().hardware.config.displayBase).toBe(0xe00000);
  });

  it('recovers invalid persisted hardware preferences to bounded defaults', () => {
    window.localStorage.setItem(
      IDE_PERSISTENCE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        hardware: {
          config: {
            displayBase: 0xe00001,
            ledAddress: 0xe00000,
            switchAddress: 0xe00010,
            buttonAddress: 0xe00012,
          },
          automaticInterruptLevels: [9, 3, 3, 'bad'],
          automaticInterruptIntervalMs: -100,
        },
      })
    );

    const store = createIdeStore();
    expect(store.getState().hardware).toMatchObject({
      config: { displayBase: 0xe00000, ledAddress: 0xe00010 },
      automaticInterruptLevels: [3],
      automaticInterruptIntervalMs: 50,
    });
  });
});
