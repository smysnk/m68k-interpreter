import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { selectStatusBarModel } from '@/store/statusBarSelectors';
import { requestReset, setEngineMode, type AppDispatch, type EngineMode, type RootState } from '@/store';

const ENGINE_OPTIONS: Array<{ value: EngineMode; label: string }> = [
  { value: 'interpreter', label: 'Interpreter' },
  { value: 'interpreter-redux', label: 'Interpreter Redux' },
];

const StatusBar: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const model = useSelector((state: RootState) => selectStatusBarModel(state));
  const engineMode = useSelector((state: RootState) => state.settings.engineMode);
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const engineMenuRef = useRef<HTMLDivElement | null>(null);
  const engineButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeEngineLabel = useMemo(
    () =>
      ENGINE_OPTIONS.find((option) => option.value === engineMode)?.label ??
      'Interpreter',
    [engineMode]
  );

  useEffect(() => {
    if (!engineMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!engineMenuRef.current?.contains(event.target as Node)) {
        setEngineMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setEngineMenuOpen(false);
        engineButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [engineMenuOpen]);

  const handleEngineChange = (nextEngineMode: EngineMode): void => {
    setEngineMenuOpen(false);

    if (nextEngineMode === engineMode) {
      return;
    }

    dispatch(setEngineMode(nextEngineMode));
    dispatch(requestReset());
  };

  return (
    <footer className="status-bar" aria-label="IDE status bar">
      <div className="status-bar-section status-bar-section-left">
        <span className={`status-pill status-pill-${model.runtime.tone}`}>{model.runtime.label}</span>
        <div className="status-engine-control" ref={engineMenuRef}>
          <span className="status-item">Engine:</span>
          <button
            ref={engineButtonRef}
            aria-controls="status-engine-menu"
            aria-expanded={engineMenuOpen}
            aria-haspopup="listbox"
            aria-label="Interpreter engine"
            className={`status-engine-button ${engineMenuOpen ? 'open' : ''}`}
            onClick={() => setEngineMenuOpen((current) => !current)}
            type="button"
          >
            <span>{activeEngineLabel}</span>
            <FontAwesomeIcon icon={faChevronDown} size="sm" />
          </button>
          {engineMenuOpen ? (
            <div className="status-engine-menu" id="status-engine-menu" role="listbox" aria-label="Interpreter engine options">
              {ENGINE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  aria-selected={option.value === engineMode}
                  className={`status-engine-option ${option.value === engineMode ? 'active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => handleEngineChange(option.value)}
                  role="option"
                  type="button"
                >
                  {option.label}
                  {option.value === 'interpreter-redux' ? ' (Experimental)' : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="status-bar-section status-bar-section-center" />

      <div className="status-bar-section status-bar-section-right">
        <span className="status-item">{model.locationLabel}</span>
        <span className="status-item">Frame: {model.frameLabel}</span>
        <span className="status-item">Stop: {model.stopLabel}</span>
      </div>
    </footer>
  );
};

export default StatusBar;
