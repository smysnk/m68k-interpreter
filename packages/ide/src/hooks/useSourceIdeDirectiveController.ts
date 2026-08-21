import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { parseSourceIdeDirective, resolveSourceIdeLayout } from '@/config/sourceIdeDirective';
import {
  replaceActiveLayout,
  restoreSourceIdeBaseline,
  setEditorCode,
  setEmulationConfig,
  setSpeedMultiplier,
  sourceIdeApplied,
  sourceIdeCleared,
  sourceIdeIgnored,
  sourceIdeInvalid,
  type AppDispatch,
  type RootState,
  type SourceIdeBaseline,
} from '@/store';
import { getActiveFile } from '@/store/filesSlice';
import { executionCoordinator } from '@/runtime/executionCoordinator';

function restoreBaseline(dispatch: AppDispatch, baseline: SourceIdeBaseline): void {
  dispatch(
    setEmulationConfig({
      cpuModel: baseline.cpuModel,
      machineProfile: baseline.machineProfile,
    })
  );
  dispatch(setSpeedMultiplier(baseline.speedMultiplier));
  dispatch(restoreSourceIdeBaseline(baseline.panelLayout));
}

export function useSourceIdeDirectiveController(): void {
  const dispatch = useDispatch<AppDispatch>();
  const activeFile = useSelector((state: RootState) => getActiveFile(state.files));
  const sourceIde = useSelector((state: RootState) => state.sourceIde);
  const settings = useSelector((state: RootState) => state.settings);
  const speedMultiplier = useSelector((state: RootState) => state.emulator.speedMultiplier);
  const panelLayout = useSelector((state: RootState) => state.panelLayout);
  const terminalGeometryVersion = useSelector(
    (state: RootState) => state.emulator.terminal.geometryVersion
  );
  const handledActivationRef = useRef('');

  useEffect(() => {
    const parsed = parseSourceIdeDirective(activeFile.content);
    const headerKey =
      parsed.status === 'valid'
        ? parsed.signature
        : parsed.status === 'invalid'
          ? `invalid:${parsed.raw}`
          : 'none';
    const activationKey = `${activeFile.id}:${sourceIde.reapplyRequest}:${headerKey}`;
    if (handledActivationRef.current === activationKey) return;
    handledActivationRef.current = activationKey;

    const existingBaseline = sourceIde.baseline;
    const baseline: SourceIdeBaseline = existingBaseline ?? {
      cpuModel: settings.cpuModel,
      machineProfile: settings.machineProfile,
      speedMultiplier,
      panelLayout: {
        activeLayout: structuredClone(panelLayout.activeLayout),
        activeSourceViewId: panelLayout.activeSourceViewId,
        activeLayoutDirty: panelLayout.activeLayoutDirty,
      },
    };
    if (existingBaseline) restoreBaseline(dispatch, existingBaseline);

    if (parsed.status === 'none') {
      dispatch(sourceIdeCleared());
      executionCoordinator.execute('reset');
      return;
    }
    if (sourceIde.ignoredFileIds.includes(activeFile.id)) {
      dispatch(sourceIdeIgnored({ fileId: activeFile.id, raw: parsed.raw }));
      executionCoordinator.execute('reset');
      return;
    }
    if (parsed.status === 'invalid') {
      dispatch(
        sourceIdeInvalid({
          fileId: activeFile.id,
          raw: parsed.raw,
          diagnostics: parsed.diagnostics,
        })
      );
      executionCoordinator.execute('reset');
      return;
    }

    const resolved = resolveSourceIdeLayout(parsed.directive, baseline.panelLayout.activeLayout);
    if (resolved.diagnostics.length) {
      dispatch(
        sourceIdeInvalid({
          fileId: activeFile.id,
          raw: parsed.raw,
          diagnostics: resolved.diagnostics,
        })
      );
      executionCoordinator.execute('reset');
      return;
    }

    dispatch(
      sourceIdeApplied({
        baseline,
        fileId: activeFile.id,
        raw: parsed.raw,
        signature: parsed.signature,
        directive: parsed.directive,
        diagnostics: [],
        terminalGeometryVersion,
      })
    );
    dispatch(
      setEmulationConfig({
        cpuModel: parsed.directive.cpu ?? baseline.cpuModel,
        machineProfile: parsed.directive.machine ?? baseline.machineProfile,
      })
    );
    dispatch(setSpeedMultiplier(parsed.directive.speed ?? baseline.speedMultiplier));
    dispatch(replaceActiveLayout(resolved.layout));
    dispatch(setEditorCode(activeFile.content));
    executionCoordinator.execute('reset');
  }, [
    activeFile,
    dispatch,
    panelLayout.activeLayout,
    panelLayout.activeLayoutDirty,
    panelLayout.activeSourceViewId,
    settings.cpuModel,
    settings.machineProfile,
    sourceIde.baseline,
    sourceIde.ignoredFileIds,
    sourceIde.reapplyRequest,
    speedMultiplier,
    terminalGeometryVersion,
  ]);
}
