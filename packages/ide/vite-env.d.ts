/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDE_AUTOPLAY?: string;
  readonly VITE_IDE_PRELOAD_FILE?: string;
  readonly VITE_IDE_PROFILE_RENDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
