import fs from 'node:fs';
import type { Plugin } from 'vite';

export function asmSourcePlugin(): Plugin {
  return {
    name: 'asm-latin1-source',
    enforce: 'pre',
    load(id) {
      const [filePath] = id.split('?', 1);

      if (!filePath.endsWith('.asm')) {
        return null;
      }

      return {
        code: `export default ${JSON.stringify(fs.readFileSync(filePath, 'latin1'))};`,
        map: null,
      };
    },
  };
}
