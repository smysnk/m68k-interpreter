import { describe, expect, it } from 'vitest';
import { createIdeStore } from '@/store';
import { selectStatusBarModel } from '@/store/statusBarSelectors';

describe('statusBarSelectors', () => {
  it('derives the default status bar model from Redux state', () => {
    const store = createIdeStore();
    const model = selectStatusBarModel(store.getState());

    expect(model.runtime.label).toBe('Ready');
    expect(model.engineLabel).toBe('Interpreter');
  });
});
