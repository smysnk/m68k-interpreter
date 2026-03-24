import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { requestFocusTerminal, requestRun, setWorkspaceTab, type AppDispatch, type RootState } from '@/store';
import { getIdeBootConfig } from '@/config/ideBootConfig';

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

export function useBootProgramController() {
  const dispatch = useDispatch<AppDispatch>();
  const activeFileId = useSelector((state: RootState) => state.files.activeFileId);
  const hasAutoPlayedRef = useRef(false);
  const { autoPlay } = getIdeBootConfig();

  useEffect(() => {
    if (hasAutoPlayedRef.current || !autoPlay || isJsdomEnvironment()) {
      return;
    }

    if (!activeFileId) {
      return;
    }

    hasAutoPlayedRef.current = true;
    dispatch(setWorkspaceTab('terminal'));
    dispatch(requestFocusTerminal());
    dispatch(requestRun());
  }, [activeFileId, autoPlay, dispatch]);
}

