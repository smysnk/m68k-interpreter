import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  requestSourceIdeIgnore,
  requestSourceIdeReapply,
  type AppDispatch,
  type RootState,
} from '@/store';

export default function SourceIdeStatusControl(): React.ReactElement | null {
  const current = useSelector((state: RootState) => state.sourceIde.current);
  const dispatch = useDispatch<AppDispatch>();
  if (current.status === 'none') return null;

  const appliedLayout =
    current.status === 'applied' ? (current.directive.layout ?? 'custom') : null;
  const label =
    current.status === 'applied'
      ? `Source config · ${appliedLayout}`
      : current.status === 'invalid'
        ? 'Source config warning'
        : 'Source config ignored';
  const title =
    current.status === 'invalid'
      ? `${current.raw}\n${current.diagnostics.join('\n')}`
      : current.raw;

  return (
    <div
      className={`source-ide-status source-ide-status-${current.status}`}
      data-source-ide-file-id={current.fileId}
      data-source-ide-status={current.status}
      title={title}
    >
      <span>{label}</span>
      <button
        aria-label="Reapply source configuration"
        onClick={() => dispatch(requestSourceIdeReapply(current.fileId))}
        title="Parse and reapply the source configuration"
        type="button"
      >
        Reapply
      </button>
      {current.status !== 'ignored' ? (
        <button
          aria-label="Ignore source configuration"
          onClick={() => dispatch(requestSourceIdeIgnore(current.fileId))}
          title="Restore your workspace configuration for this file"
          type="button"
        >
          Ignore
        </button>
      ) : null}
    </div>
  );
}
