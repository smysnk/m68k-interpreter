import React from 'react';
import type { Registers } from '@m68k/interpreter';
import {
  REGISTER_GROUPS,
  getRegisterDescriptorsByGroup,
  type RegisterDescriptor,
} from './registerDescriptors';
import RegisterGroupSection from './RegisterGroupSection';

type RegisterMatrixProps = {
  onCommit: (descriptor: RegisterDescriptor, value: number) => void;
  values: Registers;
};

const RegisterMatrix: React.FC<RegisterMatrixProps> = ({ onCommit, values }) => {
  const [dataGroup, addressGroup, controlGroup] = REGISTER_GROUPS;

  return (
    <div className="registers-matrix">
      <RegisterGroupSection
        descriptors={getRegisterDescriptorsByGroup('data')}
        group={dataGroup}
        onCommit={onCommit}
        values={values}
      />
      <RegisterGroupSection
        descriptors={getRegisterDescriptorsByGroup('address')}
        group={addressGroup}
        onCommit={onCommit}
        values={values}
      />
      <RegisterGroupSection
        descriptors={getRegisterDescriptorsByGroup('control')}
        group={controlGroup}
        onCommit={onCommit}
        values={values}
        variant="compact"
      />
    </div>
  );
};

export default RegisterMatrix;
