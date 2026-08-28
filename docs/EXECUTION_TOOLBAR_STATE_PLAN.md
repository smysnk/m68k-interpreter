# Execution Toolbar State Plan

## Objective

Make the top-bar Start/Continue, Debug, Stop, and Restart controls communicate the IDE's current execution state and expose only actions that are valid in that state.

The toolbar, keyboard shortcuts, and status bar must share one state model so their presentation and behavior cannot drift apart.

## Execution status

Implemented on 2026-08-24.

- The shared runtime phase and toolbar presentation selectors are implemented in `executionControlSelectors.ts`.
- Start, Stop, and Restart lifecycle commands now publish shared pending state.
- Navbar buttons, keyboard shortcuts, runtime guards, and the status bar consume the shared policy.
- Ready, Running, Pausing, Paused, Waiting, Source changed, Halted, Error, Starting, Stopping, and Restarting have explicit presentation models.
- The execution group exposes a live text state, dynamic accessible names, native disabled states, busy states, and non-color current-state markers.
- Disabled toolbar controls no longer receive hover elevation, and pending animation respects reduced-motion preferences.
- Debugger-panel reveal behavior was moved to a shell presentation hook so runtime orchestration continues to satisfy the panel-layout architecture boundary.
- Table-driven selector tests, Navbar tests, keyboard tests, full IDE tests, focused Chromium state transitions, and dark/light responsive visual checks cover the completed behavior.

## Current behavior and seams

The runtime controls currently live in `packages/ide/src/components/Navbar.tsx`.

- Start/Continue is always styled as the accented action, including while the program is already running or halted.
- Debug has state-aware disabling through `selectPauseForDebuggingControlModel`.
- Stop and Restart are always enabled even when no runtime exists.
- The toolbar derives `shouldStartFresh` locally while the status bar independently derives its runtime label in `statusBarSelectors.ts`.
- The generic `.btn-toolbar:hover` rule applies hover elevation without excluding disabled controls.
- Keyboard shortcuts dispatch commands separately from the navbar and therefore need the same availability policy.
- Pause has shared pending state, but starting, stopping, and restarting do not expose an equivalent lifecycle state. Repeated input can therefore arrive before an asynchronous transition is reflected in Redux.

Relevant implementation seams:

- `packages/ide/src/components/Navbar.tsx`
- `packages/ide/src/store/codeDebuggerSelectors.ts`
- `packages/ide/src/store/statusBarSelectors.ts`
- `packages/ide/src/runtime/executionKeyboardCommands.ts`
- `packages/ide/src/runtime/executionCoordinator.ts`
- `packages/ide/src/hooks/useEmulatorEvents.ts`
- `packages/ide/src/store/emulatorSlice.ts`
- `packages/ide/src/styles/main.css`

## Canonical execution phases

Introduce a canonical runtime phase that is derived from runtime readiness, execution state, debugger state, pending commands, source freshness, and active-source availability.

The expected phases are:

- `ready`: No active execution session and runnable source is available.
- `empty`: No active execution session and the active source is empty.
- `starting`: A fresh runtime is being initialized.
- `running`: The current source is executing.
- `pause-requested`: A pause has been requested but has not reached an instruction boundary.
- `paused`: The debugger is stopped at an actionable location, including a breakpoint, watchpoint, manual pause, completed step, run-to-cursor stop, interrupt, or exception break.
- `waiting`: The program is waiting for terminal or device input.
- `source-stale`: The editor source changed after the active runtime was assembled. This is an overlay on the old runtime state, not evidence that the old runtime has stopped.
- `halted`: The program completed or halted normally.
- `exception`: Execution terminated with an exception.
- `stopping`: The active runtime is being disposed.
- `restarting`: The active runtime is being replaced and started again.

The selector should preserve the underlying runtime state when source is stale so the UI can truthfully distinguish, for example, `source-stale` with an old program still running from a stale stopped session.

## Control-state matrix

| IDE state            | Start / Continue                | Debug                  | Stop                               | Restart                         |
| -------------------- | ------------------------------- | ---------------------- | ---------------------------------- | ------------------------------- |
| Empty                | Disabled                        | Disabled               | Disabled                           | Disabled                        |
| Ready                | Enabled: **Start**              | Disabled               | Disabled                           | Disabled                        |
| Starting             | Disabled, busy/current          | Disabled               | Disabled                           | Disabled                        |
| Running              | Disabled, current               | Enabled                | Enabled                            | Enabled                         |
| Pause requested      | Disabled                        | Disabled, busy/current | Enabled                            | Enabled                         |
| Paused or breakpoint | Enabled: **Continue**           | Disabled, current      | Enabled                            | Enabled                         |
| Waiting for input    | Disabled                        | Disabled               | Enabled                            | Enabled                         |
| Source changed       | Enabled: **Run updated source** | Disabled               | Enabled when an old runtime exists | Enabled when source is runnable |
| Halted or completed  | Enabled: **Start again**        | Disabled               | Disabled                           | Enabled when source is runnable |
| Exception            | Enabled: **Start again**        | Disabled               | Disabled                           | Enabled when source is runnable |
| Stopping             | Disabled                        | Disabled               | Disabled, busy/current             | Disabled                        |
| Restarting           | Disabled                        | Disabled               | Disabled                           | Disabled, busy/current          |

Stop and Restart remain available during a pending pause because both actions provide an explicit escape from a pause request. Their handlers must cancel the pending request before continuing.

## Presentation model

Add a memoized `selectExecutionToolbarModel` selector. Prefer deriving both it and the status-bar model from a smaller shared `selectRuntimePhaseModel` selector rather than having either component interpret raw Redux fields.

The toolbar model should expose:

```ts
interface ExecutionToolbarModel {
  phase: RuntimePhase;
  stateLabel: string;
  stateTone: 'neutral' | 'running' | 'paused' | 'waiting' | 'danger';
  sourceStale: boolean;
  controls: {
    run: ExecutionToolbarControl;
    debug: ExecutionToolbarControl;
    stop: ExecutionToolbarControl;
    restart: ExecutionToolbarControl;
  };
}

interface ExecutionToolbarControl {
  enabled: boolean;
  label: string;
  title: string;
  current: boolean;
  busy: boolean;
}
```

The selector is responsible for all labels and explanations. Components should not reproduce phase conditions.

Examples of state-aware titles include:

- `Program is already running`
- `Pause for debugging (F6)`
- `Pausing at the next instruction boundary`
- `Continue from the current instruction (F5)`
- `Waiting for terminal input`
- `Run the updated source (F5)`
- `Start a program before debugging`
- `No active program to stop`

## Visual design

Keep the four-icon arrangement while making state and availability visible.

1. Add an execution-specific class to each control instead of relying only on the generic `btn-toolbar` rules.
2. Mark the control representing the current phase with `data-current-state="true"` and a persistent filled background, stronger border, and small non-color state marker.
3. Style available actions neutrally until hover or keyboard focus.
4. Render unavailable actions with reduced opacity and `cursor: not-allowed`.
5. Scope hover and active effects to `:not(:disabled)` so disabled controls never rise or brighten.
6. Add a compact adjacent state label such as `READY`, `RUNNING`, `PAUSING`, `PAUSED`, `WAITING`, `HALTED`, or `ERROR`.
7. Use tone as a secondary cue:
   - running: accent or positive tone;
   - paused and waiting: warning tone;
   - exception: danger tone;
   - ready and halted: neutral tone.
8. Give pending actions a restrained animation or spinner and disable that animation under `prefers-reduced-motion`.
9. Validate the treatment in both light and dark themes and at compact breakpoints.

The state label and state marker ensure that the UI does not rely on color alone.

## Accessibility contract

- Keep the controls as action buttons; do not use `aria-pressed`, because they are not toggles.
- Set native `disabled` for unavailable commands.
- Set `aria-busy="true"` on the command currently transitioning.
- Update button `aria-label` and `title` text to describe the action or the reason it is unavailable.
- Expose the adjacent state label through `aria-live="polite"`, but avoid announcing unchanged render cycles.
- Add the current phase to the group label or description so screen-reader users receive the same state information as sighted users.
- Preserve visible `:focus-visible` treatment for every enabled control.

## Command enforcement

The selector is a presentation boundary, not the sole safety mechanism.

Create a pure command-availability policy that can be used by:

- `selectExecutionToolbarModel` for rendering;
- `executionKeyboardCommands.ts` before dispatching shortcuts;
- runtime handlers in `useEmulatorEvents.ts` as the authoritative final guard.

This prevents a disabled toolbar button from being bypassed by F5, F6, Shift+F5, repeated clicks, or queued coordinator commands.

Starting, stopping, and restarting should set a shared pending-command value before asynchronous work begins and clear it in success, cancellation, replacement, and error paths. Runtime replacement must continue to use the existing epoch checks so a stale completion cannot clear the pending state of a newer session.

## Implementation phases

### Phase 1: Define and test the state contract

1. Add `RuntimePhase`, command availability, and presentation-model types.
2. Implement the shared phase selector and `selectExecutionToolbarModel`.
3. Refactor `selectStatusBarModel` to consume the shared phase without changing its existing labels unnecessarily.
4. Add table-driven selector tests for every state in the control-state matrix, including source-stale overlays.

### Phase 2: Track asynchronous lifecycle commands

1. Add shared pending state for `start`, `stop`, and `restart` alongside the existing pending-pause state.
2. Set and settle pending state in the execution handlers.
3. Cover successful, failed, cancelled, and runtime-replacement paths.
4. Verify duplicate start/restart requests cannot create overlapping runtimes.

### Phase 3: Convert the navbar to the presentation model

1. Remove local `shouldStartFresh` and raw execution/debugger conditionals from `Navbar.tsx`.
2. Render disabled, current, and busy attributes from the selector.
3. Add the compact live state label.
4. Keep existing icons and keyboard shortcut names.
5. Ensure Stop and Restart cancel a pending pause before acting.

### Phase 4: Apply state-specific styling

1. Add execution-control classes and data-attribute selectors to `main.css`.
2. Add disabled, current, busy, focus, and tone treatments.
3. Exclude disabled controls from hover elevation.
4. Add reduced-motion behavior.
5. Confirm the four-button group retains its current footprint at supported widths.

### Phase 5: Align keyboard and runtime guards

1. Apply the availability policy before keyboard dispatch.
2. Retain equivalent guards in runtime command handlers.
3. Add tests proving disabled commands are ignored through mouse and keyboard input.
4. Verify enabled shortcuts continue to prevent the browser default action.

### Phase 6: End-to-end validation

Exercise these transitions in Chromium:

1. Ready to Starting to Running.
2. Running to Pause requested to Paused.
3. Paused to Running through Continue.
4. Running or Paused to Ready through Stop.
5. Restart from Running, Paused, Waiting, Halted, and Exception states.
6. Waiting for terminal input and resuming through input rather than an invalid Continue action.
7. Editing source during an active or paused session and running the updated source.
8. Empty source and assembly failure behavior.
9. Keyboard shortcuts matching visible button availability.
10. Light theme, dark theme, compact layout, focus visibility, and reduced motion.

## Acceptance criteria

- The toolbar visibly communicates Ready, Running, Pausing, Paused, Waiting, Halted, and Error states.
- Exactly one control or the adjacent state label represents the current execution phase without implying that a disabled action is available.
- Every invalid command is natively disabled and ignored at the keyboard and runtime boundaries.
- Start, Stop, Pause, and Restart cannot be submitted repeatedly during their pending transitions.
- Start becomes Continue only at an actionable debugger stop.
- Waiting programs direct the user toward input rather than presenting Continue as a valid action.
- Source changes are presented as stale without pretending that an older runtime has already stopped.
- Toolbar and status-bar state cannot disagree because they share the same phase selector.
- Disabled controls do not animate, elevate, or brighten on hover.
- State remains understandable without color and is exposed to assistive technology.
- Focused unit, selector, keyboard, integration, and browser tests pass with no new expected failures.

## Out of scope

- Changing the established execution icons.
- Adding new debugger commands.
- Reworking the Code-panel step toolbar.
- Changing emulator execution semantics beyond rejecting commands that are invalid for the current phase.
