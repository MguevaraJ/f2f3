import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { AppSettings, SettingsView, VisionProviderId } from '@shared/types'
import { JsonStore } from './JsonStore'
import type { MinecraftLocator } from './MinecraftLocator'
import type { SecretStore } from './SecretStore'

const KEY_NAMES: Record<VisionProviderId, string | null> = {
  anthropic: 'anthropicApiKey',
  openai: 'openaiApiKey',
  gemini: 'geminiApiKey',
  ollama: null
}
const ENV_KEYS: Record<VisionProviderId, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: null
}
const PROVIDERS: VisionProviderId[] = ['anthropic', 'openai', 'gemini', 'ollama']

export const DEFAULT_VISION_MODEL = 'claude-opus-5-5'

/**
 * User preferences plus the Anthropic API key. The key never reaches the renderer:
 * it is encrypted with Electron's safeStorage (OS keychain) and only decrypted in main.
 */
export class SettingsService extends EventEmitter<{ changed: [AppSettings, AppSettings] }> {
  private readonly store: JsonStore<AppSettings>
  constructor(
    userDataDir: string,
    locator: MinecraftLocator,
    private readonly secrets: SecretStore
  ) {
    super()
    this.store = new JsonStore<AppSettings>(join(userDataDir, 'settings.json'), {
      screenshotsDir: locator.defaultScreenshotsDir(),
      fontSource: '',
      autoAnalyze: true,
      visionEnabled: false,
      visionProvider: 'anthropic',
      visionModels: { anthropic: DEFAULT_VISION_MODEL, openai: '', gemini: '', ollama: '' },
      openaiBaseUrl: '',
      ollamaUrl: '',
      localModelEnabled: false,
      onboardingDone: false,
      dismissedTips: [],
      visionAuto: false,
      thumbnailSize: 220,
      confirmDelete: true,
      backupAuto: true,
      notifyNewShots: true,
      notifyAutoCopy: false,
      closeAction: 'ask',
      // Windows/macOS always have a tray; many Linux setups (i3, GNOME) don't.
      trayIcon: process.platform !== 'linux',
      launchAtLogin: false,
      worldSeeds: {}
    })
  }

  get value(): AppSettings {
    return this.store.value
  }

  view(): SettingsView {
    return {
      ...this.store.value,
      apiKeys: Object.fromEntries(PROVIDERS.map((p) => [p, !!this.getProviderKey(p)])) as Record<
        VisionProviderId,
        boolean
      >,
      apiKeyEncrypted: PROVIDERS.some(
        (p) => KEY_NAMES[p] && this.secrets.isEncrypted(KEY_NAMES[p]!)
      )
    }
  }

  update(patch: Partial<AppSettings>): SettingsView {
    const before = { ...this.store.value }
    this.store.update((s) => Object.assign(s, sanitize(patch)))
    this.emit('changed', this.store.value, before)
    return this.view()
  }

  getProviderKey(provider: VisionProviderId): string | null {
    const name = KEY_NAMES[provider]
    const env = ENV_KEYS[provider]
    return (name && this.secrets.get(name)) || (env && process.env[env]) || null
  }

  setProviderKey(provider: VisionProviderId, key: string | null): SettingsView {
    const name = KEY_NAMES[provider]
    if (name) this.secrets.set(name, key?.trim() || null)
    return this.view()
  }

  flush(): void {
    this.store.flush()
  }
}

function sanitize(patch: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...patch }
  if (out.thumbnailSize !== undefined)
    out.thumbnailSize = Math.min(420, Math.max(140, out.thumbnailSize))
  if (out.closeAction !== undefined && !['ask', 'background', 'quit'].includes(out.closeAction))
    delete out.closeAction
  if (out.visionProvider !== undefined && !PROVIDERS.includes(out.visionProvider))
    delete out.visionProvider
  if (out.visionModels !== undefined)
    out.visionModels = Object.fromEntries(
      PROVIDERS.map((p) => [
        p,
        String(out.visionModels?.[p] ?? '')
          .trim()
          .slice(0, 200)
      ])
    ) as Record<VisionProviderId, string>
  for (const k of ['openaiBaseUrl', 'ollamaUrl'] as const)
    if (out[k] !== undefined && out[k] !== '' && !/^https?:\/\/[^\s]+$/.test(out[k]!)) delete out[k]
  if (out.worldSeeds !== undefined)
    out.worldSeeds = Object.fromEntries(
      Object.entries(out.worldSeeds ?? {})
        .map(([w, s]) => [String(w).trim().slice(0, 100), String(s).trim()] as const)
        .filter(([w, s]) => w && /^-?\d{1,20}$/.test(s))
        .slice(0, 200)
    )
  if (out.dismissedTips !== undefined)
    out.dismissedTips = out.dismissedTips.filter((t) => typeof t === 'string').slice(0, 50)
  return out
}
