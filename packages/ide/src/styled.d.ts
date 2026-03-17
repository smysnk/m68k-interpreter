import 'styled-components';
import type { IdeThemeDefinition } from '@/theme/editorThemeRegistry';

declare module 'styled-components' {
  export interface DefaultTheme extends IdeThemeDefinition {}
}
