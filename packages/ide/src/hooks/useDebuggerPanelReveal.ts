import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  isActionableDebuggerStop,
  revealPanelKind,
  type AppDispatch,
  type RootState,
} from '@/store';

/** Shell-level presentation reaction for newly actionable debugger stops. */
export function useDebuggerPanelReveal(): void {
  const dispatch = useDispatch<AppDispatch>();
  const stop = useSelector((state: RootState) => state.debugger.snapshot.stop);
  const lastRevealedStopKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!stop || !isActionableDebuggerStop(stop.reason)) {
      lastRevealedStopKeyRef.current = null;
      return;
    }

    const stopKey = [stop.reason, stop.pc, stop.breakpointId ?? '', stop.watchpointId ?? ''].join(
      ':'
    );
    if (lastRevealedStopKeyRef.current === stopKey) return;

    lastRevealedStopKeyRef.current = stopKey;
    dispatch(revealPanelKind('debugger'));
  }, [dispatch, stop]);
}
