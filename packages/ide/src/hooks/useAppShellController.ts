import { useBootProgramController } from '@/hooks/useBootProgramController';
import { useChromeMeasurementController } from '@/hooks/useChromeMeasurementController';
import { useSystemThemeController } from '@/hooks/useSystemThemeController';
import { useWorkspaceIntentController } from '@/hooks/useWorkspaceIntentController';

export function useAppShellController() {
  const chrome = useChromeMeasurementController();

  useBootProgramController();
  useSystemThemeController();
  useWorkspaceIntentController();

  return chrome;
}
