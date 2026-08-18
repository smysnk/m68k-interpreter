import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  requestFocusTerminal,
  requestRun,
  revealPanelKind,
  type AppDispatch,
  type RootState,
} from '@/store';
import { getIdeBootConfig } from '@/config/ideBootConfig';

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

export function useBootProgramController() {
  const dispatch = useDispatch<AppDispatch>();
  const activeFileId = useSelector((state: RootState) => state.files.activeFileId);
  const sourceIdeCurrent = useSelector((state: RootState) => state.sourceIde.current);
  const terminalGeometryVersion = useSelector(
    (state: RootState) => state.emulator.terminal.geometryVersion
  );
  const lastAutoPlayedKeyRef = useRef('');
  const hasObservedSourceDirectiveRef = useRef(false);
  const { autoPlay } = getIdeBootConfig();

  useEffect(() => {
    if (!autoPlay || isJsdomEnvironment()) {
      return;
    }

    if (!activeFileId) {
      return;
    }

    if (terminalGeometryVersion <= 1) {
      return;
    }

    if (sourceIdeCurrent.status !== 'none') hasObservedSourceDirectiveRef.current = true;
    const sourceAutoRun =
      sourceIdeCurrent.status === 'applied'
        ? sourceIdeCurrent.fileId === activeFileId && sourceIdeCurrent.run === 'auto'
        : sourceIdeCurrent.status === 'none' && !hasObservedSourceDirectiveRef.current;
    if (!sourceAutoRun) return;
    const autoplayKey =
      sourceIdeCurrent.status === 'applied'
        ? `${activeFileId}:${sourceIdeCurrent.signature}:${sourceIdeCurrent.applySequence}`
        : `boot:${activeFileId}`;
    if (lastAutoPlayedKeyRef.current === autoplayKey) return;
    lastAutoPlayedKeyRef.current = autoplayKey;
    if (sourceIdeCurrent.status !== 'applied' || sourceIdeCurrent.directive.focus === 'terminal') {
      dispatch(revealPanelKind('terminal'));
      dispatch(requestFocusTerminal());
    }
    dispatch(requestRun());
  }, [activeFileId, autoPlay, dispatch, sourceIdeCurrent, terminalGeometryVersion]);
}
