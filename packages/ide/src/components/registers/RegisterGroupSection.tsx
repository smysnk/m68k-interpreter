import React from 'react';
import type { Registers } from '@m68k/interpreter';
import type { RegisterDescriptor, RegisterGroupDescriptor } from './registerDescriptors';
import RegisterCard from './RegisterCard';

type RegisterGroupSectionProps = {
  descriptors: RegisterDescriptor[];
  group: RegisterGroupDescriptor;
  onCommit: (descriptor: RegisterDescriptor, value: number) => void;
  values: Registers;
  variant?: 'stack' | 'compact';
};

const RegisterGroupSection: React.FC<RegisterGroupSectionProps> = ({
  descriptors,
  group,
  onCommit,
  values,
  variant = 'stack',
}) => (
  <section
    className={`register-group-section register-group-section-${group.id} register-group-section-${variant}`}
    data-register-group={group.id}
  >
    <div className={`register-group-grid register-group-grid-${variant}`}>
      {descriptors.map((descriptor) => (
        <RegisterCard
          descriptor={descriptor}
          key={descriptor.key}
          onCommit={onCommit}
          value={values[descriptor.key] ?? 0}
        />
      ))}
    </div>
  </section>
);

export default RegisterGroupSection;
