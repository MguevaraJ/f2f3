import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { AppSettings, SettingsView } from '@shared/types'
import { JsonStore } from './JsonStore'
import type { MinecraftLocator } from './MinecraftLocator'

interface Secrets {
  /** base64; encrypted with the OS keychain when available. */
  apiKey?: string
  encrypted?: boolean
}

export const DEFAULT_VISION_MODEL = 'claude-opus-5-5'

/**
 * User preferences plus the Anthropic API key. The key never reaches the renderer:
 * it is encrypted with Electron's safeStorage (OS keychain) and only decrypted in main.
 */
export class SettingsService extends EventEmitter<{ changed: [AppSettings, AppSettings] }> {
  private readonly store: JsonStore<AppSettings>
  private readonly secrets: JsonStore<Secrets>

  constructor(userDataDir: string, locator: MinecraftLocator) {
    super()
    this.store = new JsonStore<AppSettings>(join(userDataDir, 'settings.json'), {
      screenshotsDir: locator.defaultScreenshotsDir(),
      fontSource: '',
      autoAnalyze: true,
      visionEnabled: false,
      visionModel: DEFAULT_VISION_MODEL,
      visionAuto: false,
      thumbnailSize: 220,
      confirmDelete: true
    })
    this.secrets = new JsonStore<Secrets>(join(userDataDir, 'secrets.json'), {}, 0)
  }

  get value(): AppSettings {
    return this.store.value
  }

  view(): SettingsView {
    return {
      ...this.store.value,
      hasApiKey: !!this.getApiKey(),
      apiKeyEncrypted: !!this.secrets.value.encrypted
    }
  }

  update(patch: Partial<AppSettings>): SettingsView {
    const before = { ...this.store.value }
    this.store.update((s) => Object.assign(s, sanitize(patch)))
    this.emit('changed', this.store.value, before)
    return this.view()
  }

  getApiKey(): string | null {
    const { apiKey, encrypted } = this.secrets.value
    if (apiKey) {
      try {
        const buf = Buffer.from(apiKey, 'base64')
        return encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8')
      } catch {
        return null
      }
    }
    return process.env.ANTHROPIC_API_KEY ?? null
  }

  setApiKey(key: string | null): SettingsView {
    const trimmed = key?.trim()
    this.secrets.update((s) => {
      if (!trimmed) {
        delete s.apiKey
        delete s.encrypted
        return
      }
      const canEncrypt = safeStorage.isEncryptionAvailable()
      s.apiKey = (canEncrypt ? safeStorage.encryptString(trimmed) : Buffer.from(trimmed)).toString(
        'base64'
      )
      s.encrypted = canEncrypt
    })
    this.secrets.flush()
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
