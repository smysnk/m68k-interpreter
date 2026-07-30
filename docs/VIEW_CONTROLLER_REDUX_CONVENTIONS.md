# View / Controller Redux Conventions

## Purpose

This document records the working conventions for the IDE shell after the view/controller Redux refactor.

Use it as the default architecture guide when changing:

- top-level IDE interface components
- shell layout behavior
- menu and toolbar interactions
- runtime control flows
- selector and controller boundaries

## Core Rules

### 1. Views render and dispatch intents

Top-level interface components should:

- read finished view models from Redux selectors
- render UI from those models
- dispatch semantic store actions
- avoid orchestrating sibling components directly

Examples:

- [Navbar.tsx](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/components/Navbar.tsx)
- [StatusBar.tsx](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/components/StatusBar.tsx)
- [WorkspacePanel.tsx](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/components/WorkspacePanel.tsx)
- [InspectorPanel.tsx](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/components/InspectorPanel.tsx)

### 2. Controllers own side effects

Cross-cutting browser/runtime effects should live in controller hooks or middleware, not in view components.

Current root controller modules:

- [useAppShellController.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useAppShellController.ts)
- [useSystemThemeController.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useSystemThemeController.ts)
- [useWorkspaceIntentController.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useWorkspaceIntentController.ts)
- [useChromeMeasurementController.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useChromeMeasurementController.ts)
- [useEmulatorEvents.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useEmulatorEvents.ts)

### 3. Selectors own derived UI state

If a component needs a presentational decision like:

- active menu item state
- layout choice
- which inspector pane is shown
- grouped register/file view models

that logic should live in selectors, not inline in the component body.

Current selector modules:

- [appShellSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/appShellSelectors.ts)
- [navbarSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/navbarSelectors.ts)
- [statusBarSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/statusBarSelectors.ts)
- [fileExplorerSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/fileExplorerSelectors.ts)
- [flagsSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/flagsSelectors.ts)
- [registerSelectors.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/registerSelectors.ts)

### 4. Redux owns cross-cutting UI state

Redux is the source of truth for:

- active workspace tab
- active inspector pane
- context/help visibility
- app menu state
- active submenu
- shell layout sizes
- chrome offsets
- editor theme and follow-system preference
- engine selection
- selected file and file contents
- runtime control settings
- summarized runtime state
- runtime command intents

Relevant slices:

- [uiShellSlice.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/uiShellSlice.ts)
- [settingsSlice.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/settingsSlice.ts)
- [filesSlice.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/filesSlice.ts)
- [emulatorSlice.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/emulatorSlice.ts)

### 5. Hot-path buffers stay outside Redux

Do not move terminal or memory byte buffers back into Redux.

Keep those in external surface/runtime stores:

- [terminalSurfaceStore.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/runtime/terminalSurfaceStore.ts)
- [memorySurfaceStore.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/runtime/memorySurfaceStore.ts)

Redux should only hold summarized metadata for those systems.

## What “Prop-Free” Means Here

For the main interface components, “prop-free” means:

- no parent-passed app state
- no parent-passed cross-cutting callbacks
- local props are still allowed for leaf presentation subcomponents inside a pane

The target top-level interface list is:

- `Navbar`
- `StatusBar`
- `Editor`
- `Terminal`
- `Registers`
- `Memory`
- `Flags`
- `HelpPanel`
- `FileExplorerSidebar`
- `WorkspacePanel`
- `InspectorPanel`

## Runtime Command Flow

Views should not emit browser custom events for runtime control directly.

Use Redux intent actions from [emulatorSlice.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/store/emulatorSlice.ts):

- `requestRun`
- `requestResume`
- `requestStep`
- `requestUndo`
- `requestReset`
- `requestFocusTerminal`

Those intents are consumed by controller logic in [useEmulatorEvents.ts](/Users/josh/play/nibbles68k/references/m68k-interpreter/packages/ide/src/hooks/useEmulatorEvents.ts) and related root controllers.

## When Adding New UI Behavior

Use this order:

1. decide whether the state is cross-cutting or purely local
2. if cross-cutting, add or extend a Redux slice
3. add a selector that returns the final view model
4. have the view read the selector and dispatch semantic actions
5. put browser/runtime side effects in a controller hook or middleware

## Anti-Patterns To Avoid

- passing large prop bags down from `App`
- deriving menu/layout presentation inline in view components
- direct `window.dispatchEvent(...)` runtime orchestration from views
- storing terminal framebuffers or memory byte arrays in Redux
- putting DOM refs into Redux

## Current Status

The IDE shell is now operating in the intended pattern:

- `AppShell` is mostly composition plus controller mounting
- main interface components are prop-free at the top level
- cross-cutting UI communication goes through Redux
- derived shell/menu/pane models live in selectors
- runtime buffers remain external
- runtime commands use Redux intents
