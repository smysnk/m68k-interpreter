import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setWorkspaceTab, type AppDispatch, type RootState } from '@/store';

export function useWorkspaceIntentController(): void {
  const dispatch = useDispatch<AppDispatch>();
  const runtimeIntents = useSelector((state: RootState) => state.emulator.runtimeIntents);
  const runIntentRef = React.useRef(runtimeIntents.run);
  const resumeIntentRef = React.useRef(runtimeIntents.resume);
  const stepIntentRef = React.useRef(runtimeIntents.step);

  const showTerminalWorkspace = React.useCallback((): void => {
    dispatch(setWorkspaceTab('terminal'));
  }, [dispatch]);

  useEffect(() => {
    if (runtimeIntents.run === runIntentRef.current) {
      return;
    }

    runIntentRef.current = runtimeIntents.run;
    showTerminalWorkspace();
  }, [runtimeIntents.run, showTerminalWorkspace]);

  useEffect(() => {
    if (runtimeIntents.resume === resumeIntentRef.current) {
      return;
    }

    resumeIntentRef.current = runtimeIntents.resume;
    showTerminalWorkspace();
  }, [runtimeIntents.resume, showTerminalWorkspace]);

  useEffect(() => {
    if (runtimeIntents.step === stepIntentRef.current) {
      return;
    }

    stepIntentRef.current = runtimeIntents.step;
    showTerminalWorkspace();
  }, [runtimeIntents.step, showTerminalWorkspace]);
}
