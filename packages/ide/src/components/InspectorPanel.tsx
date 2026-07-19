import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Memory from './Memory';
import Registers from './Registers';
import HardwarePanelPreview from './HardwarePanelPreview';
import { selectInspectorPanelModel, setInspectorView, type AppDispatch } from '@/store';

const InspectorPanel: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { activeInspectorPane } = useSelector(selectInspectorPanelModel);
  const tabs = [
    { id: 'registers', label: 'Registers' },
    { id: 'memory', label: 'Memory' },
    { id: 'hardware', label: 'Hardware' },
  ] as const;

  return (
    <div className="inspector-panel">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        {tabs.map((tab) => {
          const active = activeInspectorPane === tab.id;

          return (
            <button
              aria-controls={`inspector-tabpanel-${tab.id}`}
              aria-selected={active}
              className={`inspector-tab ${active ? 'active' : ''}`}
              id={`inspector-tab-${tab.id}`}
              key={tab.id}
              onClick={() => dispatch(setInspectorView(tab.id))}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`inspector-tab-${activeInspectorPane}`}
        className="inspector-section inspector-machine-section"
        id={`inspector-tabpanel-${activeInspectorPane}`}
        role="tabpanel"
      >
        {activeInspectorPane === 'hardware' ? (
          <HardwarePanelPreview />
        ) : activeInspectorPane === 'memory' ? (
          <Memory />
        ) : (
          <Registers />
        )}
      </div>
    </div>
  );
};

export default InspectorPanel;
