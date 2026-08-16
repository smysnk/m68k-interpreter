import { describe, expect, it, vi } from 'vitest';
import { Easy68kHardware } from '@m68k/interpreter';
import { createHardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';

describe('hardwareSurfaceStore', () => {
  it('publishes only observable version changes', () => {
    const store = createHardwareSurfaceStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const hardware = new Easy68kHardware();
    const first = hardware.getSnapshot();

    expect(store.publish(first)).toBe(true);
    expect(store.publish(first)).toBe(false);
    hardware.setToggle(2, true);
    expect(store.publish(hardware.getSnapshot())).toBe(true);
    expect(store.getSnapshot().switches).toBe(4);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('preserves unrelated device snapshot identity for selector isolation', () => {
    const store = createHardwareSurfaceStore();
    const hardware = new Easy68kHardware([
      {
        id: 'display-a',
        deviceType: 'display',
        displayBase: 0xe00000,
      },
      {
        id: 'display-b',
        deviceType: 'display',
        displayBase: 0xe00020,
      },
    ]);
    store.publish(hardware.getSnapshot());
    const previousB = store.getDeviceSnapshot('display-b');

    hardware.writeByte(0xe00000, 0x3f);
    store.publish(hardware.getSnapshot());

    expect(store.getDeviceSnapshot('display-a')?.display[0]).toBe(0x3f);
    expect(store.getDeviceSnapshot('display-b')).toBe(previousB);
  });
});
