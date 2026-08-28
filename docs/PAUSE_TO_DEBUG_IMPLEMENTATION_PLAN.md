# Pause-to-debug implementation plan

## Objective

Make every pause entry point perform one canonical **pause for debugging** transition. Clicking the top execution-bar control, the Code-panel Debug control, or pressing `F6` must request the same runtime operation and, after the runtime confirms the stop, place the IDE into a synchronized debugging presentation.

The top-bar control will no longer present as a generic media pause button. It will use a debugging icon, accessible name, and tooltip that communicate that pausing enters the debugger.

## Current state

- The top-bar Pause button and Code-panel Debug button both ultimately call `executionCoordinator.execute('pause')`.
- The worker already stops execution, creates a `manual-pause` debugger stop, publishes a complete runtime frame, and emits a stopped event.
- The Code-panel button records pause telemetry and keeps a component-local pending state; the top-bar button does neither.
- A confirmed manual pause expands Code-panel debug controls and highlights the current source instruction.
- Pausing does not reveal a Debugger panel. Existing browser coverage deliberately asserts that debugging panels do not open automatically.
- The explicit Debug layout replaces the complete panel layout, while `revealPanelKind('debugger')` can reuse, restore, or add only the Debugger panel.

## Desired interaction contract

1. The program must be running before pause-for-debugging is enabled.
2. Top-bar Pause, Code-panel Debug, and `F6` submit the same semantic command.
3. The first accepted request sets one shared pending state and prevents duplicate requests.
4. The runtime stops at an instruction boundary and publishes one authoritative `manual-pause` snapshot.
5. Only after that snapshot arrives does the IDE enter its stopped debugging presentation.
6. The current instruction, registers, and debugger snapshot must describe the same stop.
7. The Code-panel command rail expands and the Debugger panel becomes visible.
8. Continuing clears the stop and resumes execution. The Debugger panel remains under user layout control instead of being removed automatically.
9. Reset, runtime replacement, source invalidation, or a failed pause clears pending and stale stop state.

## Design decisions

### One canonical command boundary

Keep `executionCoordinator` as the UI-to-runtime boundary. Either retain the command identifier `pause` and formally define it as pause-for-debugging, or rename it to `pauseForDebugging` in one mechanical migration. Do not let individual buttons combine runtime commands, telemetry, and Redux mutations independently.

Move pause-request telemetry into the canonical handler so all entry points produce exactly one measurement.

### Shared pending state

Add shared debugger state such as `pauseRequestPending`, with explicit request, confirmation, failure, and reset actions. Both toolbar controls derive disabled/busy presentation from the same selector. This replaces the Code-panel button's local two-second pending timer and keeps duplicate Code panels synchronized.

The pending state is an intent lifecycle only. Whether the IDE is actually paused must continue to come from the runtime debugger snapshot.

### Authoritative debugger mode

Do not add an independent persistent `debugMode` boolean. Derive stopped-debugging presentation from a current, non-stale debugger snapshot whose status and stop reason are actionable. A manual pause is confirmed by:

```ts
snapshot.status === 'paused' && snapshot.stop?.reason === 'manual-pause';
```

Breakpoint, watchpoint, step-complete, run-to-cursor, exception, and interrupt stops should continue to use the same stopped-debugging presentation contract.

### Non-destructive panel transition

On the first confirmed actionable debugger stop, dispatch `revealPanelKind('debugger')`. This must:

- Restore and focus an existing minimized Debugger panel.
- Reuse an existing visible Debugger panel without creating a duplicate.
- Add a Debugger panel to the current layout when none exists.
- Preserve the user's columns, panel sizes, floating panels, and saved layout selection.

Do not automatically call `resetToPreset('debug')`. Replacing the complete layout is reserved for the explicit **Apply Debug layout** command. If product direction later requires full preset switching, first add a saved pre-debug layout and an explicit return contract.

### Debugging icon and accessible wording

Replace the top-bar `faPause` icon with Font Awesome's `faBug` debugging icon.

Use the following control contract:

- Accessible name: `Pause for debugging`
- Tooltip: `Pause for debugging (F6)`
- Icon: `faBug`
- Disabled conditions: runtime unavailable, not running, stopped, ended, debugger already stopped, or pause request pending

The Code-panel control may continue to display the text **Debug**, but it must use the same accessible action name and pending state. The debugging icon is visual presentation only; the accessible name must communicate the action without relying on the icon.

### Continue and stop lifecycle

- Continue clears the debugger stop through the existing runtime transition and collapses stopped-only Code controls.
- Continue does not close the Debugger panel or restore a previous layout automatically.
- Stop/reset clears pending pause state, stop-register history, and runtime debugger snapshots while retaining debugger configuration according to existing reset policy.
- Editing or replacing source marks the stop stale and removes current-instruction presentation until the source is reassembled and synchronized.

## Implementation phases

1. [x] **Unify pause intent**
   - Add one canonical pause-for-debugging handler at the execution coordination/runtime hook boundary.
   - Route the top bar, Code-panel Debug button, and `F6` through it.
   - Move `recordDebuggerPauseRequest()` out of the Code-panel component.

2. [x] **Add shared pending state**
   - Add request/confirm/fail/reset actions to `debuggerSlice`.
   - Expose shared selectors for pause availability and pending state.
   - Remove component-local pause-request timers.
   - Make rapid repeated requests idempotent.

3. [x] **Confirm the runtime stop contract**
   - Synchronize debugger configuration before requesting pause.
   - Preserve the worker ordering: stop loop, create manual stop, publish complete frame, emit stopped event, acknowledge command.
   - Ensure in-process and worker transports publish equivalent debugger, register, execution, and source-location state.
   - Clear pending state only from confirmed snapshot, explicit failure, reset, or bounded recovery timeout.

4. [x] **Enter debugging presentation**
   - Derive active stopped-debugging presentation from the synchronized debugger snapshot.
   - Expand Code-panel debug controls and highlight the current instruction.
   - Reveal/focus the Debugger panel non-destructively with `revealPanelKind('debugger')`.
   - Reuse existing panels and avoid duplicate debugger instances.
   - Preserve custom and saved layouts.

5. [x] **Replace the top-bar icon and copy**
   - Replace `faPause` with `faBug` in `Navbar.tsx`.
   - Change the accessible name to `Pause for debugging`.
   - Change the tooltip to `Pause for debugging (F6)`.
   - Add pending and stopped presentation where needed without making the icon the only status indicator.

6. [x] **Complete lifecycle behavior**
   - Clear pending state on continue, stop, reset, source replacement, runtime disposal, and failure.
   - Leave revealed debugging panels in the user's layout on continue.
   - Preserve the existing source-staleness guard for execution highlighting.
   - Keep reverse-step controls excluded from the toolbar until exact reverse execution is ready.

7. [x] **Validate the complete flow**
   - Add unit coverage for Navbar, Code header, selectors, debugger reducer, keyboard commands, runtime command port, and worker host.
   - Update browser tests that currently assert no debugger panel is opened by manual pause.
   - Add browser coverage for top-bar pause, Code-panel Debug, and `F6` parity.
   - Validate duplicate Code panels, rapid double-clicks, minimized/existing Debugger panels, custom layouts, continue, stop, and source edits.
   - Run focused Vitest suites, IDE type-check, production build, debugger Playwright tests, and `git diff --check`.

## Acceptance criteria

- The top-bar control displays a bug/debugging icon rather than a media pause icon.
- Its accessible name and tooltip say **Pause for debugging** and retain the `F6` shortcut.
- Top-bar Pause, Code-panel Debug, and `F6` each issue exactly one identical pause request.
- All entry points share one pending/disabled state and telemetry path.
- A successful request yields an authoritative `manual-pause` snapshot before debugging UI is shown.
- Status reads Paused, the current source instruction is highlighted, and stopped registers match the same program counter.
- Code-panel debugging controls expand consistently across duplicate Code panels.
- The Debugger panel becomes visible without replacing the active layout or creating duplicates.
- Continue resumes execution and clears stopped-only presentation without closing the Debugger panel.
- Stop, reset, failure, runtime replacement, and source invalidation cannot leave the IDE stuck in pending or displaying stale stop state.
- Breakpoint and other actionable debugger stops continue to use the same presentation contract.
- Reverse-step controls remain absent from the debugger toolbar.

## Primary implementation seams

- `packages/ide/src/components/Navbar.tsx`
- `packages/ide/src/components/code/CodeDebuggerHeaderAccessory.tsx`
- `packages/ide/src/runtime/executionCoordinator.ts`
- `packages/ide/src/runtime/executionKeyboardCommands.ts`
- `packages/ide/src/hooks/useEmulatorEvents.ts`
- `packages/ide/src/runtime/runtimeCommandPort.ts`
- `packages/ide/src/runtime/worker/InterpreterWorkerHost.ts`
- `packages/ide/src/store/debuggerSlice.ts`
- `packages/ide/src/store/codeDebuggerSelectors.ts`
- `packages/ide/src/store/panelLayoutSlice.ts`
- `tests/e2e/debugger.spec.ts`

## Validation evidence to record during execution

- Focused test names and pass counts.
- IDE type-check and production build result.
- Browser evidence for all three entry points.
- Proof that an existing/minimized Debugger panel is reused.
- Proof that a custom layout is preserved.
- Pause-request-to-snapshot latency and duplicate-request count.
- Final `git diff --check` and scoped worktree status.

## Completion evidence

Completed on 2026-08-24.

- The canonical handler in `useEmulatorEvents` accepts the request once, records telemetry once, synchronizes debugger configuration, invokes the runtime pause command, and confirms pending state only from a synchronized `manual-pause` snapshot. Failure, timeout, continue, reset, runtime replacement, source invalidation, fault, and disposal paths clear the shared intent.
- Navbar, Code-panel Debug, and `F6` all submit `executionCoordinator.execute('pause')`. Navbar now uses `faBug`, the accessible name **Pause for debugging**, the tooltip **Pause for debugging (F6)**, and the shared busy/disabled state.
- Actionable debugger snapshots dispatch `revealPanelKind('debugger')` once per stop. Reducer coverage proves an existing minimized panel is restored rather than duplicated, column identity and widths remain unchanged, and the selected saved custom view and its stored document are preserved.
- Focused Vitest: 8 files passed; 73 tests passed and 7 pre-existing expected-failure tests remained explicitly marked.
- Runtime coverage includes both worker and in-process pause command paths. The existing worker-host test verifies the exact `frame -> stopped -> reply` order and ignores a duplicate pause after the stop.
- Chromium debugger suite: 10 tests accepted, including the Code-panel button, top-bar button, `F6`, breakpoint stops, duplicate Code panels, continue behavior, source replacement, and explicit Debug layout. The two pre-existing waiting-input cases remain declared expected failures.
- Browser telemetry verified one request and one manual-pause snapshot for each entry point, less than 1,000 ms request-to-snapshot latency, and exactly one accepted request when duplicate Code controls dispatch click events together.
- IDE type-check passed. The production Vite build passed with 259 modules transformed; its existing large-chunk advisory remains non-blocking.
- Focused ESLint passed. `git diff --check` passed, and the scoped status review kept the pre-existing `StatusBar.test.tsx` and interpreter `emulationConfig.ts` edits outside this implementation.
