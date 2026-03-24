import React from 'react';
import { useSelector } from 'react-redux';
import { useEmulatorStore } from '@/stores/emulatorStore';
import RegisterCard from './registers/RegisterCard';
import {
  type RegisterGroupId,
  type RegisterDescriptor,
} from './registers/registerDescriptors';
import { selectRegisterFlagsHeadingModel, selectRegisterGroupsModel } from '@/store';

const Registers: React.FC = () => {
  const { registers, setRegisterInEmulator } = useEmulatorStore();
  const { currentFlags, ccrHex } = useSelector(selectRegisterFlagsHeadingModel);
  const registerGroups = useSelector(selectRegisterGroupsModel);
  const [flagsCollapsed, setFlagsCollapsed] = React.useState(true);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<RegisterGroupId, boolean>>({
    data: true,
    address: true,
    control: true,
  });

  const handleRegisterCommit = React.useCallback(
    (descriptor: RegisterDescriptor, value: number) => {
      if (!descriptor.editable) {
        return;
      }

      setRegisterInEmulator(descriptor.key as never, value);
    },
    [setRegisterInEmulator]
  );

  const handleToggleGroup = React.useCallback((groupId: RegisterGroupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  return (
    <div className="registers-container pane-surface">
      <div className="registers-content registers-content-condensed">
        <section className="registers-group registers-group-flags" data-register-group="flags">
          <button
            aria-controls="register-group-panel-flags"
            aria-expanded={!flagsCollapsed}
            className="registers-group-toggle"
            data-register-group="flags"
            onClick={() => setFlagsCollapsed((current) => !current)}
            type="button"
          >
            <span className="registers-group-heading">
              <span aria-hidden="true" className="registers-group-indicator" />
              <span className="registers-group-title">Flags</span>
            </span>
            <span className="registers-group-count">{currentFlags.length + 1}</span>
          </button>
          <div
            className="registers-group-panel"
            id="register-group-panel-flags"
            hidden={flagsCollapsed}
          >
            <div className="registers-flags-panel" aria-label="Current condition flags">
              {currentFlags.map((flag) => (
                <div
                  className={`registers-flag-chip ${flag.active ? 'set' : 'clear'}`}
                  key={flag.key}
                >
                  <span className="registers-flag-name">{flag.label}</span>
                  <span className="registers-flag-value">{flag.active ? '1' : '0'}</span>
                </div>
              ))}
              <div className="registers-flag-chip registers-flag-chip-ccr">
                <span className="registers-flag-name">CCR</span>
                <span className="registers-flag-value">{ccrHex}</span>
              </div>
            </div>
          </div>
        </section>

        {registerGroups.map((group) => {
          const groupDescriptors = group.descriptors;
          const isCollapsed = collapsedGroups[group.id];

          return (
            <section
              aria-labelledby={`register-group-${group.id}`}
              className={`registers-group ${isCollapsed ? 'collapsed' : 'expanded'}`}
              data-register-group={group.id}
              key={group.id}
            >
              <button
                aria-controls={`register-group-panel-${group.id}`}
                aria-expanded={!isCollapsed}
                className="registers-group-toggle"
                data-register-group={group.id}
                id={`register-group-${group.id}`}
                onClick={() => handleToggleGroup(group.id)}
                type="button"
              >
                <span className="registers-group-heading">
                  <span aria-hidden="true" className="registers-group-indicator" />
                  <span className="registers-group-title">{group.title}</span>
                </span>
                <span className="registers-group-count">{groupDescriptors.length}</span>
              </button>
              <div
                className="registers-group-panel"
                id={`register-group-panel-${group.id}`}
                hidden={isCollapsed}
              >
                {groupDescriptors.map((descriptor) => (
                  <RegisterCard
                    defaultCompact
                    descriptor={descriptor}
                    key={descriptor.key}
                    onCommit={handleRegisterCommit}
                    value={group.values[descriptor.key] ?? registers[descriptor.key] ?? 0}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default Registers;
