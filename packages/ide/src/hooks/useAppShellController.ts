import { useBootProgramController } from '@/hooks/useBootProgramController';
import { useChromeMeasurementController } from '@/hooks/useChromeMeasurementController';
import { useSystemThemeController } from '@/hooks/useSystemThemeController';
import { useSourceIdeDirectiveController } from '@/hooks/useSourceIdeDirectiveController';

export function useAppShellController() {
  const chrome = useChromeMeasurementController();

  useSourceIdeDirectiveController();
  useBootProgramController();
  useSystemThemeController();

  return chrome;
}
