import { expect, test, type Page } from '@playwright/test';

const MC68010_BROWSER_PROGRAM = `ORG $80
DC.L TRAP_HANDLER
ORG $264
DC.L IRQ_HANDLER
ORG $300
VALUE DC.L $12345678
OUTPUT DC.L 0
TRAP_HANDLER
  MOVE.L #$200,D0
  MOVEC D0,VBR
  MOVEQ #3,D1
  MOVEC D1,SFC
  MOVEQ #4,D2
  MOVEC D2,DFC
  LEA VALUE,A0
  MOVES.L (A0),D3
  LEA OUTPUT,A1
  MOVES.L D3,(A1)
  ORI.W #$2000,(A7)
  RTE
IRQ_HANDLER
  MOVEQ #42,D4
  RTE
START
  TRAP #0
LOOP
  BRA LOOP
  END START`;

interface BrowserRuntime {
  controller?: {
    requestInterruptLevel(level: number): Promise<string>;
    requestPause(): Promise<void>;
    requestResume(): Promise<void>;
    requestStep(): Promise<unknown>;
  };
  getDFC?(): number;
  getException?(): string | undefined;
  getRegisters?(): Int32Array;
  getSFC?(): number;
  getSymbols?(): Record<string, number>;
  getVBR?(): number;
}

interface TestControls {
  loadSource(source: string): void;
  runProgram(): void;
  setPanelPreset(value: 'debug'): void;
}

async function selectEmulationOption(
  page: Page,
  name: 'MC68010' | 'MC68000' | 'Bare' | 'Easy68K',
  acceptRunningReset = false
) {
  if (acceptRunningReset) {
    page.once('dialog', (dialog) => dialog.accept());
  }
  await page.getByRole('button', { name: /^Emulation mode:/ }).click();
  await page
    .getByRole('menu', { name: 'Select emulation mode' })
    .getByRole('menuitemradio', { name })
    .click();
}

async function loadProgramThroughTestControls(page: Page): Promise<void> {
  await page.evaluate((source) => {
    const controls = (window as typeof window & { __M68K_IDE_TEST_CONTROLS__?: TestControls })
      .__M68K_IDE_TEST_CONTROLS__;
    if (!controls) throw new Error('IDE test controls are unavailable');
    controls.loadSource(source);
    controls.runProgram();
  }, MC68010_BROWSER_PROGRAM);
  await page.waitForFunction(() => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    return runtime?.getSymbols?.().LOOP !== undefined;
  });
}

async function runMc68010ProgramAndInterrupt(page: Page): Promise<void> {
  await loadProgramThroughTestControls(page);
  await page.waitForFunction(() => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    return runtime?.getException?.() === 'TRAP #0';
  });
  await page.evaluate(async () => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    await runtime?.controller?.requestStep();
    await runtime?.controller?.requestResume();
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
          .emulatorInstance;
        return {
          d3: runtime?.getRegisters?.()[11],
          dfc: runtime?.getDFC?.(),
          sfc: runtime?.getSFC?.(),
          vbr: runtime?.getVBR?.(),
        };
      })
    )
    .toEqual({ d3: 0x12345678, dfc: 4, sfc: 3, vbr: 0x200 });

  const interruptResult = await page.evaluate(async () => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    return runtime?.controller?.requestInterruptLevel(1);
  });
  expect(interruptResult).toBe('accepted');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { emulatorInstance?: BrowserRuntime }
          ).emulatorInstance?.getRegisters?.()[12]
      )
    )
    .toBe(42);
  await page.evaluate(async () => {
    const runtime = (window as typeof window & { emulatorInstance?: BrowserRuntime })
      .emulatorInstance;
    await runtime?.controller?.requestPause();
  });
}

test.describe('MC68010 functional browser conformance', () => {
  test('runs MOVEC, MOVES, VBR interrupts, and control-register UI under both machines', async ({
    page,
  }) => {
    await page.goto('/?ide_perf=1');
    await page.waitForFunction(
      () =>
        typeof (window as typeof window & { __M68K_IDE_TEST_CONTROLS__?: TestControls })
          .__M68K_IDE_TEST_CONTROLS__?.setPanelPreset === 'function'
    );
    await page.evaluate(() =>
      (
        window as typeof window & { __M68K_IDE_TEST_CONTROLS__?: TestControls }
      ).__M68K_IDE_TEST_CONTROLS__?.setPanelPreset('debug')
    );

    await selectEmulationOption(page, 'MC68010');
    await expect(
      page.getByRole('button', { name: 'Emulation mode: MC68010 · Easy68K' })
    ).toBeVisible();
    await runMc68010ProgramAndInterrupt(page);

    const controlGroup = page.getByRole('button', { name: /Control Registers/ });
    await controlGroup.click();
    await expect(page.getByRole('group', { name: /VBR register/ })).toBeVisible();
    await expect(page.getByLabel('VBR full hex value')).toHaveValue('0x00000200');
    await expect(page.getByLabel('SFC full hex value')).toHaveValue('0x00000003');
    await expect(page.getByLabel('DFC full hex value')).toHaveValue('0x00000004');

    await selectEmulationOption(page, 'Bare', true);
    await expect(
      page.getByRole('button', { name: 'Emulation mode: MC68010 · Bare' })
    ).toBeVisible();
    await runMc68010ProgramAndInterrupt(page);

    await selectEmulationOption(page, 'MC68000', true);
    await expect(page.getByRole('group', { name: /VBR register/ })).toHaveCount(0);
  });
});
