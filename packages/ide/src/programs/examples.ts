import arithmeticRegistersSource from '@/fixtures/arithmetic-registers.asm';
import echoInputSource from '@/fixtures/echo-input.asm';
import flagsCompareSource from '@/fixtures/flags-compare.asm';
import helloWorldSource from '@/fixtures/hello-world.asm';
import memoryCopySource from '@/fixtures/memory-copy.asm';
import nibblesSource from '@/fixtures/nibbles.asm';
import pollingInputSource from '@/fixtures/polling-input.asm';
import subroutineStackSource from '@/fixtures/subroutine-stack.asm';
import sum1To10Source from '@/fixtures/sum-1-to-10.asm';
import hardwareLedSwitchesSource from '@/fixtures/hardware-led-switches.asm';
import hardwareButtonsSource from '@/fixtures/hardware-buttons.asm';
import hardwareSevenSegmentSource from '@/fixtures/hardware-seven-segment.asm';
import hardwareInterruptsSource from '@/fixtures/hardware-interrupts.asm';
import hardwareMultiDeviceSource from '@/fixtures/hardware-multi-device.asm';
import graphicsSoundDemoSource from '@/fixtures/graphics-sound-demo.asm';
import debuggerLoopSource from '@/fixtures/debugger-loop.asm';

interface BundledExampleFile {
  id: string;
  name: string;
  path: string;
  kind: 'example';
  content: string;
}

export const bundledExampleFiles: BundledExampleFile[] = [
  {
    id: 'example:debugger-loop.asm',
    name: 'debugger-loop.asm',
    path: 'fixtures/debugger-loop.asm',
    kind: 'example',
    content: debuggerLoopSource,
  },
  {
    id: 'example:graphics-sound-demo.asm',
    name: 'graphics-sound-demo.asm',
    path: 'fixtures/graphics-sound-demo.asm',
    kind: 'example',
    content: graphicsSoundDemoSource,
  },
  {
    id: 'example:hardware-multi-device.asm',
    name: 'hardware-multi-device.asm',
    path: 'fixtures/hardware-multi-device.asm',
    kind: 'example',
    content: hardwareMultiDeviceSource,
  },
  {
    id: 'example:hardware-led-switches.asm',
    name: 'hardware-led-switches.asm',
    path: 'fixtures/hardware-led-switches.asm',
    kind: 'example',
    content: hardwareLedSwitchesSource,
  },
  {
    id: 'example:hardware-buttons.asm',
    name: 'hardware-buttons.asm',
    path: 'fixtures/hardware-buttons.asm',
    kind: 'example',
    content: hardwareButtonsSource,
  },
  {
    id: 'example:hardware-seven-segment.asm',
    name: 'hardware-seven-segment.asm',
    path: 'fixtures/hardware-seven-segment.asm',
    kind: 'example',
    content: hardwareSevenSegmentSource,
  },
  {
    id: 'example:hardware-interrupts.asm',
    name: 'hardware-interrupts.asm',
    path: 'fixtures/hardware-interrupts.asm',
    kind: 'example',
    content: hardwareInterruptsSource,
  },
  {
    id: 'example:nibbles.asm',
    name: 'nibbles.asm',
    path: 'fixtures/nibbles.asm',
    kind: 'example',
    content: nibblesSource,
  },
  {
    id: 'example:hello-world.asm',
    name: 'hello-world.asm',
    path: 'fixtures/hello-world.asm',
    kind: 'example',
    content: helloWorldSource,
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
