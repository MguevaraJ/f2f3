import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { AppSettings, SettingsView } from '@shared/types'
import { JsonStore } from './JsonStore'
import type { MinecraftLocator } from './MinecraftLocator'
import type { SecretStore } from './SecretStore'

const API_KEY = 'anthropicApiKey'

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
      visionModel: DEFAULT_VISION_MODEL,
      visionAuto: false,
      thumbnailSize: 220,
      confirmDelete: true,
      backupAuto: true
    })
  }

  get value(): AppSettings {
    return this.store.value
  }

  view(): SettingsView {
    return {
      ...this.store.value,
      hasApiKey: !!this.getApiKey(),
      apiKeyEncrypted: this.secrets.isEncrypted(API_KEY)
    }
  }

  update(patch: Partial<AppSettings>): SettingsView {
    const before = { ...this.store.value }
    this.store.update((s) => Object.assign(s, sanitize(patch)))
    this.emit('changed', this.store.value, before)
    return this.view()
  }

  getApiKey(): string | null {
    return this.secrets.get(API_KEY) ?? process.env.ANTHROPIC_API_KEY ?? null
  }

  setApiKey(key: string | null): SettingsView {
    this.secrets.set(API_KEY, key?.trim() || null)
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
  if (out.visionModel !== undefined && !/^[\w.-]+$/.test(out.visionModel)) delete out.visionModel
  return out
}
