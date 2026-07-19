import { beforeEach, describe, expect, it } from 'vitest';
import {
  createIdeStore,
  restoreHardwareDefaults,
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

    store.dispatch(restoreHardwareDefaults());
    expect(store.getState().hardware.config.displayBase).toBe(0xe00000);
  });
});
