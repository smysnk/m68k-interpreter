import 'styled-components';
import type { IdeThemeDefinition } from '@/theme/editorThemeRegistry';

declare module 'styled-components' {
  // Module augmentation needs interface extension here so styled-components picks up the IDE theme shape.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends IdeThemeDefinition {}
}
