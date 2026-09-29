/// <reference types="vite/client" />

/**
 * Build-time configuration (electron-vite exposes MAIN_VITE_* variables from .env files).
 * A Google OAuth "Desktop app" client can be baked into release builds this way.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
