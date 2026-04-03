import arithmeticRegistersSource from '@/fixtures/arithmetic-registers.asm';
import echoInputSource from '@/fixtures/echo-input.asm';
import flagsCompareSource from '@/fixtures/flags-compare.asm';
import helloTerminalSource from '@/fixtures/hello-terminal.asm';
import memoryCopySource from '@/fixtures/memory-copy.asm';
import nibblesSource from '@/fixtures/nibbles.asm';
import pollingInputSource from '@/fixtures/polling-input.asm';
import subroutineStackSource from '@/fixtures/subroutine-stack.asm';
import sum1To10Source from '@/fixtures/sum-1-to-10.asm';

interface BundledExampleFile {
  id: string;
  name: string;
  path: string;
  kind: 'example';
  content: string;
}

export const bundledExampleFiles: BundledExampleFile[] = [
  {
    id: 'example:nibbles.asm',
    name: 'nibbles.asm',
    path: 'fixtures/nibbles.asm',
    kind: 'example',
    content: nibblesSource,
  },
  {
    id: 'example:hello-terminal.asm',
    name: 'hello-terminal.asm',
    path: 'fixtures/hello-terminal.asm',
    kind: 'example',
    content: helloTerminalSource,
  },
  {
    id: 'example:echo-input.asm',
    name: 'echo-input.asm',
    path: 'fixtures/echo-input.asm',
    kind: 'example',
    content: echoInputSource,
  },
  {
    id: 'example:polling-input.asm',
    name: 'polling-input.asm',
    path: 'fixtures/polling-input.asm',
    kind: 'example',
    content: pollingInputSource,
  },
  {
    id: 'example:arithmetic-registers.asm',
    name: 'arithmetic-registers.asm',
    path: 'fixtures/arithmetic-registers.asm',
    kind: 'example',
    content: arithmeticRegistersSource,
  },
  {
    id: 'example:sum-1-to-10.asm',
    name: 'sum-1-to-10.asm',
    path: 'fixtures/sum-1-to-10.asm',
    kind: 'example',
    content: sum1To10Source,
  },
  {
    id: 'example:memory-copy.asm',
    name: 'memory-copy.asm',
    path: 'fixtures/memory-copy.asm',
    kind: 'example',
    content: memoryCopySource,
  },
  {
    id: 'example:subroutine-stack.asm',
    name: 'subroutine-stack.asm',
    path: 'fixtures/subroutine-stack.asm',
    kind: 'example',
    content: subroutineStackSource,
  },
  {
    id: 'example:flags-compare.asm',
    name: 'flags-compare.asm',
    path: 'fixtures/flags-compare.asm',
    kind: 'example',
    content: flagsCompareSource,
  },
];

export { nibblesSource };
