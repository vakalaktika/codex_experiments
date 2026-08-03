/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Both are optional on purpose: the app builds and runs without a backend, so
 * the types must not promise a value the build may not have. See lib/supabase.ts.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
