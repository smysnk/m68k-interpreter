import '@testing-library/jest-dom';

const createRect = (width: number, height: number): DOMRect =>
  ({
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => '',
  }) as DOMRect;

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

class ResizeObserverMock implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect(this: HTMLElement): DOMRect {
    if (
      this.classList.contains('retro-lcd__grid') ||
      this.classList.contains('retro-screen__grid')
    ) {
      return createRect(960, 600);
    }

    if (
      this.classList.contains('retro-lcd__probe') ||
      this.classList.contains('retro-screen__probe')
    ) {
      return createRect(12, 24);
    }

    return originalGetBoundingClientRect.call(this);
  },
});

if (typeof Range !== 'undefined') {
  const rangeRect = createRect(480, 24);
  const rangeRects = {
    0: rangeRect,
    length: 1,
    item: (index: number) => (index === 0 ? rangeRect : null),
    [Symbol.iterator]: function* iterator() {
      yield rangeRect;
    },
  } as unknown as DOMRectList;

  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rangeRect,
  });

  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => rangeRects,
  });
}
