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
});
