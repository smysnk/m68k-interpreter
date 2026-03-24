import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Memory from './Memory';
import Registers from './Registers';
import { selectInspectorPanelModel, setInspectorView, type AppDispatch } from '@/store';

const InspectorPanel: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { showRegisters } = useSelector(selectInspectorPanelModel);

  return (
    <div className="inspector-panel">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        <button
          aria-selected={showRegisters}
          className={`inspector-tab ${showRegisters ? 'active' : ''}`}
          onClick={() => dispatch(setInspectorView('registers'))}
          role="tab"
          type="button"
        >
          Registers
        </button>
        <button
          aria-selected={!showRegisters}
          className={`inspector-tab ${!showRegisters ? 'active' : ''}`}
          onClick={() => dispatch(setInspectorView('memory'))}
          role="tab"
          type="button"
        >
          Memory
        </button>
      </div>
      <div className="inspector-section inspector-machine-section">
        {showRegisters ? <Registers /> : <Memory />}
      </div>
    </div>
  );
};

export default InspectorPanel;
