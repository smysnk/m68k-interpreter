import fs from 'node:fs';
import path from 'node:path';

const tsconfigPath = path.resolve(import.meta.dirname, '../tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

if (!tsconfig.compilerOptions) {
  tsconfig.compilerOptions = {};
}

if (tsconfig.compilerOptions.jsx !== 'react-jsx') {
  tsconfig.compilerOptions.jsx = 'react-jsx';
  fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}
